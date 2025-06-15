import { expect } from 'vitest';

export function expectValidWebSocketFrame(frame, options = {}) {
  expect(frame).toBeDefined();
  expect(Buffer.isBuffer(frame)).toBe(true);
  expect(frame.length).toBeGreaterThanOrEqual(2);

  // Parse first byte
  const firstByte = frame[0];
  const fin = (firstByte & 0x80) !== 0;
  const rsv1 = (firstByte & 0x40) !== 0;
  const rsv2 = (firstByte & 0x20) !== 0;
  const rsv3 = (firstByte & 0x10) !== 0;
  const opcode = firstByte & 0x0F;

  // Parse second byte
  const secondByte = frame[1];
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7F;

  // Validate opcode
  const validOpcodes = [0x0, 0x1, 0x2, 0x8, 0x9, 0xA];
  expect(validOpcodes).toContain(opcode);

  // Control frames must have FIN set and payload < 126
  if (opcode >= 0x8) {
    expect(fin).toBe(true);
    expect(payloadLength).toBeLessThan(126);
  }

  // Reserved bits should not be set (unless extensions are used)
  if (!options.allowReservedBits) {
    expect(rsv1).toBe(false);
    expect(rsv2).toBe(false);
    expect(rsv3).toBe(false);
  }

  // Validate frame structure based on payload length
  let headerSize = 2;
  if (payloadLength === 126) {
    expect(frame.length).toBeGreaterThanOrEqual(4);
    headerSize += 2;
    payloadLength = frame.readUInt16BE(2);
  } else if (payloadLength === 127) {
    expect(frame.length).toBeGreaterThanOrEqual(10);
    headerSize += 8;
    // Read 64-bit payload length (big-endian)
    const high32 = frame.readUInt32BE(2);
    const low32 = frame.readUInt32BE(6);
    
    // Check if high 32 bits are non-zero (payload > 4GB)
    if (high32 > 0) {
      // For very large payloads, we can't validate the exact frame length due to JS number limitations
      // Just ensure the frame has at least the header
      expect(frame.length).toBeGreaterThanOrEqual(headerSize);
      payloadLength = Number.MAX_SAFE_INTEGER; // Mark as very large
    } else {
      payloadLength = low32;
    }
  }

  if (masked) {
    headerSize += 4;
  }

  // Validate frame length (skip for very large payloads due to JS number limitations)
  if (payloadLength !== Number.MAX_SAFE_INTEGER) {
    expect(frame.length).toBe(headerSize + payloadLength);
  }

  return {
    fin,
    rsv1,
    rsv2,
    rsv3,
    opcode,
    masked,
    payloadLength,
    headerSize
  };
}

export function expectConnectionState(connection, expectedState) {
  expect(connection).toBeDefined();
  expect(connection.state).toBe(expectedState);
  
  switch (expectedState) {
    case 'open':
      expect(connection.connected).toBe(true);
      break;
    case 'closed':
      expect(connection.connected).toBe(false);
      break;
    case 'ending':
      expect(connection.connected).toBe(false); // Actually set to false in close()
      expect(connection.waitingForCloseResponse).toBe(true);
      break;
    case 'peer_requested_close':
      expect(connection.connected).toBe(false); // Actually set to false when processing close frame
      break;
    case 'connecting':
      // May or may not be connected yet
      break;
    default:
      throw new Error(`Unknown connection state: ${expectedState}`);
  }
}

export function expectProtocolCompliance(interaction, standard = 'RFC6455') {
  expect(interaction).toBeDefined();
  
  switch (standard) {
    case 'RFC6455':
      expectRFC6455Compliance(interaction);
      break;
    default:
      throw new Error(`Unknown protocol standard: ${standard}`);
  }
}

function expectRFC6455Compliance(interaction) {
  const { frames, connection } = interaction;
  
  if (!frames || !Array.isArray(frames)) {
    throw new Error('Protocol compliance check requires frames array');
  }

  let fragmentationState = null; // null, 'text', or 'binary'
  let hasReceivedClose = false;

  for (const frame of frames) {
    const frameInfo = expectValidWebSocketFrame(frame);
    const { fin, opcode } = frameInfo;

    // Check fragmentation rules
    if (opcode === 0x0) { // Continuation frame
      expect(fragmentationState).not.toBeNull();
    } else if (opcode === 0x1 || opcode === 0x2) { // Text or binary
      if (!fin) {
        expect(fragmentationState).toBeNull();
        fragmentationState = opcode === 0x1 ? 'text' : 'binary';
      }
    } else if (opcode >= 0x8) { // Control frame
      // Control frames can be sent during fragmentation but don't affect state
    }

    if (fin && fragmentationState) {
      fragmentationState = null;
    }

    // Check close frame rules
    if (opcode === 0x8) { // Close frame
      expect(hasReceivedClose).toBe(false); // Only one close frame allowed
      hasReceivedClose = true;
    } else if (hasReceivedClose) {
      // No data frames allowed after close
      expect(opcode).toBeGreaterThanOrEqual(0x8);
    }
  }

  // If we ended in fragmentation state, that's a protocol violation
  expect(fragmentationState).toBeNull();
}

export function expectFrameSequence(frames, expectedSequence) {
  expect(frames).toHaveLength(expectedSequence.length);
  
  for (let i = 0; i < expectedSequence.length; i++) {
    const frame = frames[i];
    const expected = expectedSequence[i];
    const frameInfo = expectValidWebSocketFrame(frame);
    
    if (expected.opcode !== undefined) {
      expect(frameInfo.opcode).toBe(expected.opcode);
    }
    if (expected.fin !== undefined) {
      expect(frameInfo.fin).toBe(expected.fin);
    }
    if (expected.masked !== undefined) {
      expect(frameInfo.masked).toBe(expected.masked);
    }
  }
}

export function expectMessageIntegrity(originalMessage, receivedFrames, type = 'text') {
  const reassembled = reassembleMessage(receivedFrames, type);
  expect(reassembled).toBe(originalMessage);
}

function reassembleMessage(frames, type) {
  const payloads = [];
  
  for (const frame of frames) {
    const frameInfo = expectValidWebSocketFrame(frame);
    const { opcode, payloadLength, headerSize, masked } = frameInfo;
    
    // Skip control frames
    if (opcode >= 0x8) continue;
    
    // Extract payload
    let payload = frame.subarray(headerSize);
    
    // Unmask if necessary
    if (masked) {
      const maskingKey = frame.subarray(headerSize - 4, headerSize);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskingKey[i % 4];
      }
    }
    
    payloads.push(payload);
  }
  
  const combined = Buffer.concat(payloads);
  return type === 'text' ? combined.toString('utf8') : combined;
}

export function expectHandshakeHeaders(headers, requirements = {}) {
  expect(headers).toBeDefined();
  
  // Required headers for WebSocket handshake
  expect(headers.connection?.toLowerCase()).toBe('upgrade');
  expect(headers.upgrade?.toLowerCase()).toBe('websocket');
  expect(headers['sec-websocket-version']).toBe('13');
  expect(headers['sec-websocket-key']).toBeDefined();
  expect(headers['sec-websocket-key']).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  
  // Optional checks
  if (requirements.origin) {
    expect(headers.origin).toBe(requirements.origin);
  }
  if (requirements.protocol) {
    expect(headers['sec-websocket-protocol']).toContain(requirements.protocol);
  }
  if (requirements.extensions) {
    expect(headers['sec-websocket-extensions']).toBeDefined();
  }
}

export function expectCloseCode(closeCode, expectedCode, expectedCategory = null) {
  expect(closeCode).toBe(expectedCode);
  
  if (expectedCategory) {
    switch (expectedCategory) {
      case 'normal':
        expect([1000, 1001, 1002, 1003]).toContain(closeCode);
        break;
      case 'error':
        expect(closeCode).toBeGreaterThanOrEqual(1002);
        break;
      case 'reserved':
        expect([1004, 1005, 1006, 1015]).toContain(closeCode);
        break;
      case 'application':
        expect(closeCode).toBeGreaterThanOrEqual(3000);
        expect(closeCode).toBeLessThanOrEqual(4999);
        break;
      default:
        throw new Error(`Unknown close code category: ${expectedCategory}`);
    }
  }
}

export function expectPerformanceMetrics(metrics, thresholds = {}) {
  expect(metrics).toBeDefined();
  
  if (thresholds.maxLatency) {
    expect(metrics.latency).toBeLessThanOrEqual(thresholds.maxLatency);
  }
  if (thresholds.minThroughput) {
    expect(metrics.throughput).toBeGreaterThanOrEqual(thresholds.minThroughput);
  }
  if (thresholds.maxMemoryUsage) {
    expect(metrics.memoryUsage).toBeLessThanOrEqual(thresholds.maxMemoryUsage);
  }
  if (thresholds.maxCpuUsage) {
    expect(metrics.cpuUsage).toBeLessThanOrEqual(thresholds.maxCpuUsage);
  }
}

export function expectNoMemoryLeak(beforeMetrics, afterMetrics, tolerance = 0.1) {
  expect(beforeMetrics.heapUsed).toBeDefined();
  expect(afterMetrics.heapUsed).toBeDefined();
  
  const growth = afterMetrics.heapUsed - beforeMetrics.heapUsed;
  const growthPercentage = growth / beforeMetrics.heapUsed;
  
  expect(growthPercentage).toBeLessThanOrEqual(tolerance);
}

export function expectEventSequence(events, expectedSequence) {
  expect(events).toHaveLength(expectedSequence.length);
  
  for (let i = 0; i < expectedSequence.length; i++) {
    const event = events[i];
    const expected = expectedSequence[i];
    
    expect(event.type).toBe(expected.type);
    if (expected.data !== undefined) {
      expect(event.data).toEqual(expected.data);
    }
    if (expected.timestamp !== undefined) {
      expect(event.timestamp).toBeGreaterThanOrEqual(expected.timestamp);
    }
  }
}

export function expectBufferEquals(actual, expected, message) {
  expect(Buffer.isBuffer(actual)).toBe(true);
  expect(Buffer.isBuffer(expected)).toBe(true);
  expect(actual.length).toBe(expected.length);
  expect(actual.equals(expected)).toBe(true);
}

export function expectWebSocketURL(url, options = {}) {
  const parsed = new URL(url);
  
  expect(['ws:', 'wss:']).toContain(parsed.protocol);
  expect(parsed.hostname).toBeDefined();
  
  if (options.secure !== undefined) {
    expect(parsed.protocol).toBe(options.secure ? 'wss:' : 'ws:');
  }
  if (options.port !== undefined) {
    expect(parseInt(parsed.port) || (parsed.protocol === 'wss:' ? 443 : 80)).toBe(options.port);
  }
  if (options.path !== undefined) {
    expect(parsed.pathname).toBe(options.path);
  }
}

// ============================================================================
// Enhanced Event System Assertions for Phase 3.2.A.3
// ============================================================================

export function expectEventSequenceAsync(emitter, expectedSequence, options = {}) {
  const { timeout = 5000, strict = true } = options;
  
  return new Promise((resolve, reject) => {
    const capturedEvents = [];
    const listeners = new Map();
    let currentIndex = 0;
    
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Event sequence timeout after ${timeout}ms. Expected: ${expectedSequence.map(e => e.eventName).join(' → ')}, Got: ${capturedEvents.map(e => e.eventName).join(' → ')}`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      listeners.forEach((listener, eventName) => {
        emitter.removeListener(eventName, listener);
      });
      listeners.clear();
    };
    
    const processEvent = (eventName, ...args) => {
      const eventData = { eventName, args: [...args], timestamp: Date.now() };
      capturedEvents.push(eventData);
      
      if (currentIndex >= expectedSequence.length) {
        if (strict) {
          cleanup();
          reject(new Error(`Unexpected event '${eventName}' after sequence completion`));
          return;
        }
        return; // Ignore extra events in non-strict mode
      }
      
      const expected = expectedSequence[currentIndex];
      
      // Validate event name
      if (expected.eventName && expected.eventName !== eventName) {
        cleanup();
        reject(new Error(`Event sequence mismatch at index ${currentIndex}: expected '${expected.eventName}', got '${eventName}'`));
        return;
      }
      
      // Validate payload if validator provided
      if (expected.validator && !expected.validator(...args)) {
        cleanup();
        reject(new Error(`Event sequence validation failed at index ${currentIndex} for event '${eventName}'`));
        return;
      }
      
      currentIndex++;
      
      // Check if sequence is complete
      if (currentIndex >= expectedSequence.length) {
        cleanup();
        resolve(capturedEvents);
      }
    };
    
    // Set up listeners for all unique event names in sequence
    const uniqueEvents = [...new Set(expectedSequence.map(e => e.eventName))];
    uniqueEvents.forEach(eventName => {
      const listener = (...args) => processEvent(eventName, ...args);
      listeners.set(eventName, listener);
      emitter.on(eventName, listener);
    });
  });
}

export function expectEventWithPayload(emitter, eventName, expectedPayload, options = {}) {
  const { timeout = 5000, deepEqual = true, partial = false } = options;
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event '${eventName}' with expected payload after ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener(eventName, listener);
    };
    
    const listener = (...args) => {
      try {
        if (partial) {
          // Partial payload matching
          const actualPayload = args[0];
          if (typeof expectedPayload === 'object' && expectedPayload !== null) {
            for (const key in expectedPayload) {
              expect(actualPayload).toHaveProperty(key, expectedPayload[key]);
            }
          } else {
            expect(actualPayload).toBe(expectedPayload);
          }
        } else if (deepEqual) {
          expect(args).toEqual(expectedPayload);
        } else {
          expect(args).toStrictEqual(expectedPayload);
        }
        
        cleanup();
        resolve(args);
      } catch (error) {
        cleanup();
        reject(new Error(`Event '${eventName}' payload validation failed: ${error.message}`));
      }
    };
    
    emitter.once(eventName, listener);
  });
}

export function expectEventTiming(emitter, eventName, minTime, maxTime, options = {}) {
  const { timeout = Math.max(maxTime + 1000, 5000) } = options;
  const startTime = process.hrtime.bigint();
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event '${eventName}' within timing constraints after ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener(eventName, listener);
    };
    
    const listener = (...args) => {
      const eventTime = Number(process.hrtime.bigint() - startTime) / 1e6; // Convert to milliseconds
      
      try {
        expect(eventTime).toBeGreaterThanOrEqual(minTime);
        expect(eventTime).toBeLessThanOrEqual(maxTime);
        
        cleanup();
        resolve({ eventTime, args });
      } catch (error) {
        cleanup();
        reject(new Error(`Event '${eventName}' timing constraint failed: ${error.message} (actual: ${eventTime}ms)`));
      }
    };
    
    emitter.once(eventName, listener);
  });
}

export function expectNoEvent(emitter, eventName, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(); // Success - no event was emitted
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener(eventName, listener);
    };
    
    const listener = (...args) => {
      cleanup();
      reject(new Error(`Unexpected event '${eventName}' was emitted with args: ${JSON.stringify(args)}`));
    };
    
    emitter.once(eventName, listener);
  });
}

export function expectWebSocketConnectionStateTransition(connection, fromState, toState, options = {}) {
  const { timeout = 5000, validateEvents = true } = options;
  
  return new Promise((resolve, reject) => {
    // Verify initial state
    try {
      expectConnectionState(connection, fromState);
    } catch (error) {
      reject(new Error(`Initial state validation failed: ${error.message}`));
      return;
    }
    
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`State transition timeout: ${fromState} → ${toState} not completed within ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      if (validateEvents) {
        connection.removeListener('close', closeListener);
        connection.removeListener('error', errorListener);
      }
    };
    
    // Set up event listeners for validation
    let closeListener, errorListener;
    if (validateEvents) {
      closeListener = () => {
        if (toState === 'closed') {
          try {
            expectConnectionState(connection, toState);
            cleanup();
            resolve();
          } catch (error) {
            cleanup();
            reject(new Error(`State transition validation failed: ${error.message}`));
          }
        }
      };
      
      errorListener = (error) => {
        if (toState === 'closed') {
          try {
            expectConnectionState(connection, toState);
            cleanup();
            resolve();
          } catch (validationError) {
            cleanup();
            reject(new Error(`State transition validation failed after error: ${validationError.message}`));
          }
        }
      };
      
      connection.once('close', closeListener);
      connection.once('error', errorListener);
    }
    
    // Poll for state change (fallback for non-event-driven transitions)
    const pollInterval = setInterval(() => {
      try {
        expectConnectionState(connection, toState);
        clearInterval(pollInterval);
        cleanup();
        resolve();
      } catch (error) {
        // Continue polling
      }
    }, 100);
    
    // Clean up poll interval on timeout
    const originalCleanup = cleanup;
    cleanup = () => {
      clearInterval(pollInterval);
      originalCleanup();
    };
  });
}

export function expectWebSocketMessageEvent(connection, expectedMessage, options = {}) {
  const { timeout = 5000, messageType = 'utf8', validatePayload = true } = options;
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for message event after ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      connection.removeListener('message', messageListener);
    };
    
    const messageListener = (message) => {
      try {
        expect(message).toBeDefined();
        expect(message.type).toBe(messageType);
        
        if (validatePayload) {
          if (messageType === 'utf8') {
            expect(message.utf8Data).toBe(expectedMessage);
          } else if (messageType === 'binary') {
            expect(Buffer.isBuffer(message.binaryData)).toBe(true);
            if (Buffer.isBuffer(expectedMessage)) {
              expect(message.binaryData.equals(expectedMessage)).toBe(true);
            } else {
              expect(message.binaryData).toEqual(expectedMessage);
            }
          }
        }
        
        cleanup();
        resolve(message);
      } catch (error) {
        cleanup();
        reject(new Error(`Message event validation failed: ${error.message}`));
      }
    };
    
    connection.once('message', messageListener);
  });
}

export function expectWebSocketFrameEvent(connection, expectedFrameType, options = {}) {
  const { timeout = 5000, validatePayload = false, expectedPayload = null } = options;
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for frame event after ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      connection.removeListener('frame', frameListener);
    };
    
    const frameListener = (frame) => {
      try {
        expect(frame).toBeDefined();
        expect(frame.opcode).toBe(expectedFrameType);
        
        if (validatePayload && expectedPayload !== null) {
          if (Buffer.isBuffer(expectedPayload)) {
            expect(frame.binaryPayload.equals(expectedPayload)).toBe(true);
          } else if (typeof expectedPayload === 'string') {
            expect(frame.utf8Data).toBe(expectedPayload);
          } else {
            expect(frame.binaryPayload).toEqual(expectedPayload);
          }
        }
        
        cleanup();
        resolve(frame);
      } catch (error) {
        cleanup();
        reject(new Error(`Frame event validation failed: ${error.message}`));
      }
    };
    
    connection.once('frame', frameListener);
  });
}

export function expectWebSocketProtocolError(connection, expectedErrorType, options = {}) {
  const { timeout = 5000, validateCloseCode = true } = options;
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for protocol error after ${timeout}ms`));
    }, timeout);
    
    const cleanup = () => {
      clearTimeout(timer);
      connection.removeListener('error', errorListener);
      connection.removeListener('close', closeListener);
    };
    
    const errorListener = (error) => {
      // Check if this is the expected error type
      if (error.message && error.message.includes(expectedErrorType)) {
        cleanup();
        resolve(error);
      }
    };
    
    const closeListener = (reasonCode, description) => {
      if (validateCloseCode) {
        try {
          // Protocol errors typically result in specific close codes
          const protocolErrorCodes = [1002, 1007, 1008, 1009, 1010, 1011];
          expect(protocolErrorCodes).toContain(reasonCode);
          
          cleanup();
          resolve({ reasonCode, description });
        } catch (error) {
          cleanup();
          reject(new Error(`Protocol error close code validation failed: ${error.message}`));
        }
      } else {
        cleanup();
        resolve({ reasonCode, description });
      }
    };
    
    connection.once('error', errorListener);
    connection.once('close', closeListener);
  });
}