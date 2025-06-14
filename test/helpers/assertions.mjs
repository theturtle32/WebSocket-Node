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
    // For simplicity, assume high 32 bits are 0
    payloadLength = frame.readUInt32BE(6);
  }

  if (masked) {
    headerSize += 4;
  }

  expect(frame.length).toBe(headerSize + payloadLength);

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