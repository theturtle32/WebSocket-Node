import { beforeEach, afterEach, vi } from 'vitest';
import { stopAllServers } from '../helpers/test-server.mjs';

// Increase max listeners to avoid warnings when running many tests with child processes
// Vitest adds exit/beforeExit listeners for each test file with spawned processes
process.setMaxListeners(30);

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