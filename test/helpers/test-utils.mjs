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

export function captureEvents(emitter, events = []) {
  const captured = {};
  const listeners = {};

  events.forEach(eventName => {
    captured[eventName] = [];
    listeners[eventName] = (...args) => {
      captured[eventName].push({
        timestamp: Date.now(),
        args
      });
    };
    emitter.on(eventName, listeners[eventName]);
  });

  return {
    getEvents: (eventName) => captured[eventName] || [],
    getAllEvents: () => captured,
    cleanup: () => {
      events.forEach(eventName => {
        emitter.removeListener(eventName, listeners[eventName]);
      });
    }
  };
}

export function waitForEvent(emitter, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(eventName, listener);
      reject(new Error(`Timeout waiting for event '${eventName}'`));
    }, timeout);

    const listener = (...args) => {
      clearTimeout(timer);
      emitter.removeListener(eventName, listener);
      resolve(args);
    };

    emitter.once(eventName, listener);
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

export function enforceTestTimeout(timeout = 30000) {
  let timeoutHandle;
  
  beforeEach(() => {
    timeoutHandle = setTimeout(() => {
      throw new Error(`Test exceeded ${timeout}ms timeout`);
    }, timeout);
  });
  
  afterEach(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}