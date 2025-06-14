// Test configuration constants for WebSocket-Node test suite

export const TEST_CONFIG = {
  // Server configuration
  SERVER: {
    HOST: 'localhost',
    PORT: 8080,
    SECURE_PORT: 8443,
    TIMEOUT: 5000
  },
  
  // Client configuration
  CLIENT: {
    CONNECT_TIMEOUT: 5000,
    RECONNECT_ATTEMPTS: 3,
    RECONNECT_DELAY: 1000
  },
  
  // Frame configuration
  FRAME: {
    MAX_SIZE: 1024 * 1024, // 1MB
    SMALL_PAYLOAD_SIZE: 125,
    MEDIUM_PAYLOAD_SIZE: 65535,
    LARGE_PAYLOAD_SIZE: 65536
  },
  
  // Test data
  TEST_DATA: {
    TEXT_MESSAGE: 'Hello WebSocket World!',
    BINARY_MESSAGE: Buffer.from('Binary test data', 'utf8'),
    EMPTY_MESSAGE: '',
    LARGE_TEXT: 'A'.repeat(1000)
  }
};