import { beforeEach, afterEach, vi } from 'vitest';
import { TestServerManager, stopAllServers } from './test-server.mjs';
import { MockWebSocketServer, MockWebSocketClient, MockWebSocketConnection } from './mocks.mjs';

export function withTestServer(options = {}) {
  let testServer;

  beforeEach(async () => {
    testServer = new TestServerManager(options);
    await testServer.start();
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.stop();
      testServer = null;
    }
  });

  return () => testServer;
}

export function withMockServer(options = {}) {
  let mockServer;

  beforeEach(() => {
    mockServer = new MockWebSocketServer(options);
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.shutDown();
      mockServer = null;
    }
  });

  return () => mockServer;
}

export function withMockClient(options = {}) {
  let mockClient;

  beforeEach(() => {
    mockClient = new MockWebSocketClient(options);
  });

  afterEach(() => {
    if (mockClient) {
      mockClient.close();
      mockClient = null;
    }
  });

  return () => mockClient;
}

export function setupTestEnvironment() {
  beforeEach(() => {
    // Clear any global state
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup all servers
    await stopAllServers();
  });
}

export function captureEvents(emitter, events = [], options = {}) {
  const {
    filter = null,
    maxEvents = 1000,
    includeTimestamps = true,
    trackSequence = true
  } = options;

  const captured = {};
  const listeners = {};
  const eventSequence = [];
  let eventCount = 0;

  events.forEach(eventName => {
    captured[eventName] = [];
    listeners[eventName] = (...args) => {
      // Apply filter if provided
      if (filter && !filter(eventName, args)) {
        return;
      }

      // Respect max events limit
      if (eventCount >= maxEvents) {
        return;
      }

      const eventData = {
        args: [...args]
      };

      if (includeTimestamps) {
        eventData.timestamp = Date.now();
        eventData.hrTimestamp = process.hrtime.bigint();
      }

      captured[eventName].push(eventData);
      
      if (trackSequence) {
        eventSequence.push({
          eventName,
          sequenceIndex: eventCount,
          ...eventData
        });
      }

      eventCount++;
    };
    emitter.on(eventName, listeners[eventName]);
  });

  return {
    getEvents: (eventName) => captured[eventName] || [],
    getAllEvents: () => captured,
    getSequence: () => [...eventSequence],
    getEventCount: () => eventCount,
    
    // Enhanced filtering and pattern matching
    filterEvents: (eventName, filterFn) => {
      return (captured[eventName] || []).filter(event => filterFn(event));
    },
    
    findEvent: (eventName, matchFn) => {
      return (captured[eventName] || []).find(event => matchFn(event));
    },
    
    // Event sequence validation
    validateSequence: (expectedSequence) => {
      if (eventSequence.length < expectedSequence.length) {
        return { valid: false, reason: 'Not enough events captured' };
      }
      
      for (let i = 0; i < expectedSequence.length; i++) {
        const expected = expectedSequence[i];
        const actual = eventSequence[i];
        
        if (expected.eventName && actual.eventName !== expected.eventName) {
          return { 
            valid: false, 
            reason: `Event ${i}: expected '${expected.eventName}', got '${actual.eventName}'` 
          };
        }
        
        if (expected.validator && !expected.validator(actual.args)) {
          return { 
            valid: false, 
            reason: `Event ${i}: payload validation failed` 
          };
        }
      }
      
      return { valid: true };
    },
    
    // Timing verification
    getEventTiming: (eventName, index = 0) => {
      const events = captured[eventName] || [];
      if (index >= events.length) return null;
      
      const event = events[index];
      const nextEvent = events[index + 1];
      
      return {
        timestamp: event.timestamp,
        hrTimestamp: event.hrTimestamp,
        timeSinceNext: nextEvent ? Number(nextEvent.hrTimestamp - event.hrTimestamp) / 1e6 : null
      };
    },
    
    getSequenceTiming: () => {
      if (eventSequence.length < 2) return [];
      
      return eventSequence.slice(1).map((event, i) => ({
        eventName: event.eventName,
        timeSincePrevious: Number(event.hrTimestamp - eventSequence[i].hrTimestamp) / 1e6
      }));
    },
    
    cleanup: () => {
      events.forEach(eventName => {
        emitter.removeListener(eventName, listeners[eventName]);
      });
      // Clear captured data
      Object.keys(captured).forEach(key => {
        captured[key].length = 0;
      });
      eventSequence.length = 0;
      eventCount = 0;
    }
  };
}

export function waitForEvent(emitter, eventName, options = {}) {
  // Support both old signature and new options object
  if (typeof options === 'number') {
    options = { timeout: options };
  }
  
  const {
    timeout = 5000,
    condition = null,
    validator = null,
    once = true
  } = options;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeout}ms`));
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener(eventName, listener);
    };

    const listener = (...args) => {
      // Apply condition check if provided
      if (condition && !condition(...args)) {
        if (once) {
          cleanup();
          reject(new Error(`Event '${eventName}' condition not met`));
        }
        return; // Continue listening for non-once mode
      }

      // Apply validator if provided
      if (validator && !validator(...args)) {
        if (once) {
          cleanup();
          reject(new Error(`Event '${eventName}' validation failed`));
        }
        return; // Continue listening for non-once mode
      }

      cleanup();
      resolve(args);
    };

    if (once) {
      emitter.once(eventName, listener);
    } else {
      emitter.on(eventName, listener);
    }
  });
}

export function waitForEventWithPayload(emitter, eventName, expectedPayload, options = {}) {
  const { timeout = 5000, deepEqual = true } = options;
  
  return waitForEvent(emitter, eventName, {
    timeout,
    validator: (...args) => {
      if (deepEqual) {
        return JSON.stringify(args) === JSON.stringify(expectedPayload);
      }
      return args.length === expectedPayload.length && 
             args.every((arg, i) => arg === expectedPayload[i]);
    }
  });
}

export function waitForEventCondition(emitter, eventName, conditionFn, timeout = 5000) {
  return waitForEvent(emitter, eventName, {
    timeout,
    condition: conditionFn,
    once: false
  });
}

export function waitForMultipleEvents(emitter, eventConfigs, options = {}) {
  const { timeout = 5000, mode = 'all' } = options; // 'all' or 'any'
  
  const promises = eventConfigs.map(config => {
    if (typeof config === 'string') {
      return waitForEvent(emitter, config, { timeout });
    }
    return waitForEvent(emitter, config.eventName, { 
      timeout, 
      ...config.options 
    });
  });

  if (mode === 'any') {
    return Promise.race(promises);
  }
  
  return Promise.all(promises);
}

export function waitForEventSequence(emitter, eventSequence, options = {}) {
  const { timeout = 5000, sequenceTimeout = 1000 } = options;
  const results = [];
  let currentIndex = 0;

  return new Promise((resolve, reject) => {
    const overallTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event sequence after ${timeout}ms`));
    }, timeout);

    let sequenceTimer = null;
    const listeners = new Map();

    const cleanup = () => {
      clearTimeout(overallTimer);
      if (sequenceTimer) clearTimeout(sequenceTimer);
      listeners.forEach((listener, eventName) => {
        emitter.removeListener(eventName, listener);
      });
      listeners.clear();
    };

    const processEvent = (eventName, ...args) => {
      const expectedEvent = eventSequence[currentIndex];
      
      if (expectedEvent.eventName !== eventName) {
        cleanup();
        reject(new Error(`Event sequence error: expected '${expectedEvent.eventName}', got '${eventName}' at index ${currentIndex}`));
        return;
      }

      if (expectedEvent.validator && !expectedEvent.validator(...args)) {
        cleanup();
        reject(new Error(`Event sequence validation failed at index ${currentIndex} for event '${eventName}'`));
        return;
      }

      results.push({ eventName, args: [...args], index: currentIndex });
      currentIndex++;

      if (currentIndex >= eventSequence.length) {
        cleanup();
        resolve(results);
        return;
      }

      // Reset sequence timer for next event
      if (sequenceTimer) clearTimeout(sequenceTimer);
      sequenceTimer = setTimeout(() => {
        cleanup();
        reject(new Error(`Sequence timeout: event '${eventSequence[currentIndex].eventName}' not received within ${sequenceTimeout}ms`));
      }, sequenceTimeout);
    };

    // Set up listeners for all events in sequence
    eventSequence.forEach(({ eventName }) => {
      if (!listeners.has(eventName)) {
        const listener = (...args) => processEvent(eventName, ...args);
        listeners.set(eventName, listener);
        emitter.on(eventName, listener);
      }
    });

    // Start sequence timer
    if (sequenceTimeout > 0) {
      sequenceTimer = setTimeout(() => {
        cleanup();
        reject(new Error(`Sequence timeout: first event '${eventSequence[0].eventName}' not received within ${sequenceTimeout}ms`));
      }, sequenceTimeout);
    }
  });
}

export function waitForEvents(emitter, eventNames, timeout = 5000) {
  const promises = eventNames.map(eventName => waitForEvent(emitter, eventName, timeout));
  return Promise.all(promises);
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createTimeoutPromise(ms, message = 'Operation timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export function raceWithTimeout(promise, timeout = 5000, timeoutMessage) {
  return Promise.race([
    promise,
    createTimeoutPromise(timeout, timeoutMessage)
  ]);
}

export function measurePerformance(fn) {
  const start = process.hrtime.bigint();
  const startMemory = process.memoryUsage();
  
  return Promise.resolve(fn()).then(result => {
    const end = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    return {
      result,
      metrics: {
        duration: Number(end - start) / 1e6, // Convert to milliseconds
        memoryDelta: {
          rss: endMemory.rss - startMemory.rss,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        }
      }
    };
  });
}

export function repeatAsync(fn, times, interval = 0) {
  return Array.from({ length: times }, async (_, i) => {
    if (i > 0 && interval > 0) {
      await delay(interval);
    }
    return fn(i);
  });
}

export function createConnectionMock(options = {}) {
  return new MockWebSocketConnection({
    remoteAddress: '127.0.0.1',
    webSocketVersion: 13,
    protocol: null,
    ...options
  });
}

export function createRequestMock(options = {}) {
  const {
    url = '/',
    protocols = [],
    origin = 'http://localhost',
    headers = {},
    remoteAddress = '127.0.0.1'
  } = options;

  return {
    resource: url,
    requestedProtocols: protocols,
    origin,
    httpRequest: {
      headers: {
        'user-agent': 'WebSocket-Test/1.0',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers
      },
      connection: {
        remoteAddress
      }
    },
    accept: vi.fn((protocol) => createConnectionMock({ protocol })),
    reject: vi.fn()
  };
}

export function createBufferFromHex(hexString) {
  return Buffer.from(hexString.replace(/\s/g, ''), 'hex');
}

export function bufferToHex(buffer) {
  return buffer.toString('hex').toUpperCase().replace(/(.{2})/g, '$1 ').trim();
}

export function createTestMessage(type = 'text', size = 100) {
  switch (type) {
    case 'text':
      return 'Test message '.repeat(Math.ceil(size / 13)).substring(0, size);
    case 'binary':
      return Buffer.alloc(size, 0x42);
    case 'json':
      return JSON.stringify({
        id: 1,
        message: 'Test message '.repeat(Math.ceil((size - 50) / 13)),
        timestamp: new Date().toISOString()
      }).substring(0, size);
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

export function assertEventuallyTrue(condition, timeout = 5000, interval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      try {
        if (condition()) {
          resolve();
          return;
        }
      } catch (e) {
        // Condition threw an error, continue checking
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error('Condition was not satisfied within timeout'));
        return;
      }
      
      setTimeout(check, interval);
    };
    
    check();
  });
}

export function createMemoryTracker() {
  const snapshots = [];
  
  return {
    snapshot: (label = '') => {
      const memory = process.memoryUsage();
      snapshots.push({ label, memory, timestamp: Date.now() });
      return memory;
    },
    
    getSnapshots: () => [...snapshots],
    
    getDelta: (fromIndex = 0, toIndex = -1) => {
      const from = snapshots[fromIndex];
      const to = snapshots[toIndex === -1 ? snapshots.length - 1 : toIndex];
      
      if (!from || !to) {
        throw new Error('Invalid snapshot indices');
      }
      
      return {
        rss: to.memory.rss - from.memory.rss,
        heapTotal: to.memory.heapTotal - from.memory.heapTotal,
        heapUsed: to.memory.heapUsed - from.memory.heapUsed,
        external: to.memory.external - from.memory.external,
        duration: to.timestamp - from.timestamp
      };
    },
    
    clear: () => {
      snapshots.length = 0;
    }
  };
}

// Note: enforceTestTimeout removed - use Vitest's built-in testTimeout and hookTimeout
// configurations in vitest.config.mjs instead for better integration and reliability