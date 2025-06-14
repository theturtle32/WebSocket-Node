import { beforeEach, afterEach, vi } from 'vitest';
import { stopAllServers } from '../helpers/test-server.mjs';

// Global test setup for each test file
beforeEach(() => {
  // Clear all mocks and timers
  vi.clearAllTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  // Restore all mocks
  vi.restoreAllMocks();
  
  // Clean up any test servers
  await stopAllServers();
});

// Set up global test configuration
process.env.NODE_ENV = 'test';
process.env.WEBSOCKET_TIMEOUT = '15000';
process.env.WEBSOCKET_TEST_MODE = 'true';