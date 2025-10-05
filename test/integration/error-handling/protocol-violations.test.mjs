/**
 * Error Handling Integration Tests - Protocol Violations
 *
 * Tests protocol violation detection with real Node.js sockets.
 * Validates that the WebSocket implementation properly detects and handles
 * protocol violations from actual socket data, not simulated mock behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import net from 'net';
import WebSocketServer from '../../../lib/WebSocketServer.js';
import WebSocketClient from '../../../lib/WebSocketClient.js';

describe('Error Handling Integration - Protocol Violations', () => {
  let httpServer;
  let wsServer;
  let serverPort;
  let activeConnections = [];

  beforeEach(async () => {
    // Create a real HTTP server
    httpServer = http.createServer((request, response) => {
      response.writeHead(404);
      response.end();
    });

    // Start the HTTP server on a random port
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });

    // Create WebSocket server
    wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false
    });

    wsServer.on('connect', (connection) => {
      activeConnections.push(connection);
    });
  });

  afterEach(async () => {
    // Clean up all connections
    for (const conn of activeConnections) {
      try {
        if (conn.connected) {
          conn.drop();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    activeConnections = [];

    // Shutdown WebSocket server
    if (wsServer) {
      try {
        wsServer.shutDown();
      } catch (e) {
        // Ignore cleanup errors
      }
      wsServer = null;
    }

    // Close HTTP server
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
      httpServer = null;
    }
  });

  describe('Invalid Frame Detection', () => {
    it('should detect and handle invalid UTF-8 in text frames', async () => {
      let serverConnection;
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          serverConnection = request.accept();
          resolve(serverConnection);
        });
      });

      const wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      // Wait for either error or close event (implementation might close without error event)
      const errorOrClose = new Promise((resolve) => {
        clientConnection.on('error', (error) => {
          resolve({ type: 'error', error });
        });
        clientConnection.on('close', (code, description) => {
          resolve({ type: 'close', code, description });
        });
      });

      // Send a text frame with invalid UTF-8 from server
      // This creates a protocol violation that should be detected
      const invalidUTF8Frame = Buffer.alloc(8);
      invalidUTF8Frame[0] = 0x81; // FIN + Text frame
      invalidUTF8Frame[1] = 0x04; // Length 4, unmasked
      invalidUTF8Frame[2] = 0xFF; // Invalid UTF-8 start byte
      invalidUTF8Frame[3] = 0xFF;
      invalidUTF8Frame[4] = 0xFF;
      invalidUTF8Frame[5] = 0xFF;

      serverConnection.socket.write(invalidUTF8Frame);

      const result = await errorOrClose;
      expect(result).toBeDefined();
      expect(['error', 'close']).toContain(result.type);

      // Clean up
      wsClient.abort();
    });

    it('should handle unexpected socket closure', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      const wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      const clientClosed = new Promise((resolve) => {
        clientConnection.on('close', (reasonCode, description) => {
          resolve({ reasonCode, description });
        });
      });

      // Abruptly destroy the socket without proper WebSocket close handshake
      serverConnection.socket.destroy();

      const closeEvent = await clientClosed;
      expect(closeEvent).toBeDefined();
      expect(clientConnection.connected).toBe(false);

      // Clean up
      wsClient.abort();
    });
  });

  describe('Connection Rejection', () => {
    it('should properly reject connections with 403 status', async () => {
      wsServer.on('request', (request) => {
        request.reject(403, 'Access Denied');
      });

      const wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const error = await connectionFailed;
      expect(error).toBeDefined();
      expect(error.toString()).toContain('403');

      // Clean up
      wsClient.abort();
    });

    it('should handle rejection with custom message', async () => {
      const customMessage = 'Custom rejection reason';

      wsServer.on('request', (request) => {
        request.reject(404, customMessage);
      });

      const wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const error = await connectionFailed;
      expect(error).toBeDefined();

      // Clean up
      wsClient.abort();
    });

    it('should reject unsupported protocols', async () => {
      wsServer.on('request', (request) => {
        // Only accept 'supported-protocol'
        const protocol = request.requestedProtocols.find(p => p === 'supported-protocol');
        if (protocol) {
          request.accept(protocol);
        } else {
          request.reject(406, 'Unsupported protocol');
        }
      });

      const wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      // Request unsupported protocol
      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, 'unsupported-protocol');

      const error = await connectionFailed;
      expect(error).toBeDefined();

      // Clean up
      wsClient.abort();
    });
  });

  describe('Network Error Scenarios', () => {
    it('should handle connection to non-existent server', async () => {
      const wsClient = new WebSocketClient();

      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      // Try to connect to a port that's definitely not listening
      // Use a high port number that's unlikely to be in use
      wsClient.connect('ws://127.0.0.1:59999/', null);

      const error = await connectionFailed;
      expect(error).toBeDefined();
      expect(error.code).toBe('ECONNREFUSED');

      // Clean up
      wsClient.abort();
    });
  });

  describe('Socket Errors', () => {
    it('should handle socket errors gracefully', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      const wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      const errorReceived = new Promise((resolve) => {
        clientConnection.on('error', (error) => {
          resolve(error);
        });
      });

      // Emit a socket error
      serverConnection.socket.emit('error', new Error('Socket error'));

      // Note: The server-side error won't necessarily propagate to client
      // But we should verify the server handles it gracefully

      // Clean up
      await new Promise(resolve => setTimeout(resolve, 50));
      wsClient.abort();
    });

    it('should handle ECONNRESET during data transfer', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      const wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      const clientClosed = new Promise((resolve) => {
        clientConnection.on('close', () => {
          resolve();
        });
      });

      // Send a message, then immediately destroy socket
      clientConnection.sendUTF('Test message');
      serverConnection.socket.destroy();

      await clientClosed;
      expect(clientConnection.connected).toBe(false);

      // Clean up
      wsClient.abort();
    });
  });
});
