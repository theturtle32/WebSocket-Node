// Global test setup for WebSocket-Node test suite
// This file runs before all tests

// Set up global test configuration
process.env.NODE_ENV = 'test';

// Increase timeout for WebSocket operations
process.env.WEBSOCKET_TIMEOUT = '10000';

// Global setup function
function setup() {
  // Global test setup logic can be added here
  console.log('Setting up WebSocket-Node test environment...');
}

module.exports = { setup };