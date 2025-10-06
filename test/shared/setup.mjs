import { beforeEach, afterEach, vi } from 'vitest';
import { stopAllServers } from '../helpers/test-server.mjs';

// Increase max listeners to avoid warnings when running many tests with child processes
// Vitest adds exit/beforeExit listeners for each test file with spawned processes
process.setMaxListeners(30);

// Disable debug output during tests unless explicitly enabled
if (!process.env.DEBUG) {
  const debug = require('debug');
  debug.disable();
}

// Global test setup for each test file
beforeEach(() => {
  // Clear all mocks and timers
  vi.clearAllTimers();
  vi.clearAllMocks();

  // Note: We don't disable debug in beforeEach as some tests need to enable it
  // Tests that enable DEBUG should clean up properly in their own afterEach
});

afterEach(async () => {
  // Restore all mocks
  vi.restoreAllMocks();

  // Clean up any test servers
  await stopAllServers();

  // Re-disable debug after each test to prevent leakage
  if (!process.env.DEBUG) {
    const debug = require('debug');
    debug.disable();
  }
});

// Set up global test configuration
process.env.NODE_ENV = 'test';
process.env.WEBSOCKET_TIMEOUT = '15000';
process.env.WEBSOCKET_TEST_MODE = 'true';