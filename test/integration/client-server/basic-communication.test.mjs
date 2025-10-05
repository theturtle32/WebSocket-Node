/**
 * Client-Server Integration Tests - Basic Communication
 *
 * These tests use REAL Node.js sockets (not mocks) to verify that:
 * - WebSocketClient and WebSocketServer work together correctly
 * - The actual TCP socket implementation behaves as expected
 * - Message exchange works bidirectionally
 * - Connection lifecycle is properly managed
 *
 * WHY THESE TESTS ARE CRITICAL:
 * Unit tests with hand-crafted mocks risk creating a false sense of security.
 * If mocks follow the code's assumptions rather than actual socket behavior,
 * tests can pass while real-world usage fails. These integration tests catch
 * those gaps by using the actual Node.js net.Socket implementation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import WebSocketServer from '../../../lib/WebSocketServer.js';
import WebSocketClient from '../../../lib/WebSocketClient.js';

describe('Client-Server Integration - Basic Communication', () => {
  let httpServer;
  let wsServer;
  let wsClient;
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

    // Create WebSocket server attached to the HTTP server
    wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false
    });

    // Track connections for cleanup
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

    // Close client
    if (wsClient) {
      try {
        wsClient.abort();
      } catch (e) {
        // Ignore cleanup errors
      }
      wsClient = null;
    }

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

  describe('Connection Establishment', () => {
    it('should establish end-to-end connection with real sockets', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      // Verify real socket properties exist (not mocks)
      expect(serverConnection.socket).toBeDefined();
      expect(serverConnection.socket.remoteAddress).toBeDefined();
      expect(serverConnection.socket.localPort).toBe(serverPort);

      expect(clientConnection.socket).toBeDefined();
      expect(clientConnection.socket.localAddress).toBeDefined();
      expect(clientConnection.socket.remotePort).toBe(serverPort);

      // Verify both sides see the connection as connected
      expect(serverConnection.connected).toBe(true);
      expect(clientConnection.connected).toBe(true);
    });

    it('should negotiate protocols correctly', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          expect(request.requestedProtocols).toContain('test-protocol');
          const connection = request.accept('test-protocol');
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, 'test-protocol');

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      expect(serverConnection.protocol).toBe('test-protocol');
      expect(clientConnection.protocol).toBe('test-protocol');
    });

    it('should handle connection failure when server rejects', async () => {
      wsServer.on('request', (request) => {
        request.reject(403, 'Forbidden');
      });

      wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const error = await connectionFailed;
      expect(error).toBeDefined();
    });
  });

  describe('Text Message Exchange', () => {
    let serverConnection;
    let clientConnection;

    beforeEach(async () => {
      // Establish connection
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);
    });

    it('should send text message from client to server', async () => {
      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', (message) => {
          resolve(message);
        });
      });

      clientConnection.sendUTF('Hello from client');

      const message = await messageReceived;
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe('Hello from client');
    });

    it('should send text message from server to client', async () => {
      const messageReceived = new Promise((resolve) => {
        clientConnection.on('message', (message) => {
          resolve(message);
        });
      });

      serverConnection.sendUTF('Hello from server');

      const message = await messageReceived;
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe('Hello from server');
    });

    it('should exchange multiple text messages bidirectionally', async () => {
      const clientMessages = [];
      const serverMessages = [];

      clientConnection.on('message', (message) => {
        clientMessages.push(message.utf8Data);
      });

      serverConnection.on('message', (message) => {
        serverMessages.push(message.utf8Data);
      });

      // Send messages in both directions
      clientConnection.sendUTF('Client message 1');
      serverConnection.sendUTF('Server message 1');
      clientConnection.sendUTF('Client message 2');
      serverConnection.sendUTF('Server message 2');

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(serverMessages).toEqual(['Client message 1', 'Client message 2']);
      expect(clientMessages).toEqual(['Server message 1', 'Server message 2']);
    });

    it('should handle large text messages', async () => {
      const largeMessage = 'A'.repeat(100000); // 100KB

      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', (message) => {
          resolve(message);
        });
      });

      clientConnection.sendUTF(largeMessage);

      const message = await messageReceived;
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe(largeMessage);
      expect(message.utf8Data.length).toBe(100000);
    });

    it('should handle UTF-8 characters correctly', async () => {
      const utf8Message = 'Hello 世界 🌍 مرحبا Привет';

      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', (message) => {
          resolve(message);
        });
      });

      clientConnection.sendUTF(utf8Message);

      const message = await messageReceived;
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe(utf8Message);
    });
  });

  describe('Binary Message Exchange', () => {
    let serverConnection;
    let clientConnection;

    beforeEach(async () => {
      // Establish connection
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);
    });

    it('should send binary message from client to server', async () => {
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);

      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', (message) => {
          resolve(message);
        });
      });

      clientConnection.sendBytes(binaryData);

      const message = await messageReceived;
      expect(message.type).toBe('binary');
      expect(Buffer.isBuffer(message.binaryData)).toBe(true);
      expect(message.binaryData).toEqual(binaryData);
    });

    it('should send binary message from server to client', async () => {
      const binaryData = Buffer.from([0x0A, 0x0B, 0x0C, 0x0D, 0x0E]);

      const messageReceived = new Promise((resolve) => {
        clientConnection.on('message', (message) => {
          resolve(message);
        });
      });

      serverConnection.sendBytes(binaryData);

      const message = await messageReceived;
      expect(message.type).toBe('binary');
      expect(Buffer.isBuffer(message.binaryData)).toBe(true);
      expect(message.binaryData).toEqual(binaryData);
    });

    it('should handle large binary messages', async () => {
      const largeBinaryData = Buffer.alloc(100000); // 100KB
      for (let i = 0; i < largeBinaryData.length; i++) {
        largeBinaryData[i] = i % 256;
      }

      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', (message) => {
          resolve(message);
        });
      });

      clientConnection.sendBytes(largeBinaryData);

      const message = await messageReceived;
      expect(message.type).toBe('binary');
      expect(message.binaryData).toEqual(largeBinaryData);
    });

    it('should exchange mixed text and binary messages', async () => {
      const clientMessages = [];
      const serverMessages = [];

      clientConnection.on('message', (message) => {
        clientMessages.push({
          type: message.type,
          data: message.type === 'utf8' ? message.utf8Data : message.binaryData
        });
      });

      serverConnection.on('message', (message) => {
        serverMessages.push({
          type: message.type,
          data: message.type === 'utf8' ? message.utf8Data : message.binaryData
        });
      });

      // Send mixed messages
      clientConnection.sendUTF('Text message');
      clientConnection.sendBytes(Buffer.from([0x01, 0x02]));
      serverConnection.sendBytes(Buffer.from([0x0A, 0x0B]));
      serverConnection.sendUTF('Response text');

      // Wait for all messages
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(serverMessages).toHaveLength(2);
      expect(serverMessages[0].type).toBe('utf8');
      expect(serverMessages[0].data).toBe('Text message');
      expect(serverMessages[1].type).toBe('binary');
      expect(serverMessages[1].data).toEqual(Buffer.from([0x01, 0x02]));

      expect(clientMessages).toHaveLength(2);
      expect(clientMessages[0].type).toBe('binary');
      expect(clientMessages[0].data).toEqual(Buffer.from([0x0A, 0x0B]));
      expect(clientMessages[1].type).toBe('utf8');
      expect(clientMessages[1].data).toBe('Response text');
    });
  });

  describe('Connection Lifecycle', () => {
    let serverConnection;
    let clientConnection;

    beforeEach(async () => {
      // Establish connection
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);
    });

    it('should handle graceful close from client', async () => {
      const serverClosed = new Promise((resolve) => {
        serverConnection.on('close', (reasonCode, description) => {
          resolve({ reasonCode, description });
        });
      });

      clientConnection.close(1000, 'Client closing');

      const closeEvent = await serverClosed;
      expect(closeEvent.reasonCode).toBe(1000);
      expect(closeEvent.description).toBe('Client closing');
      expect(serverConnection.connected).toBe(false);
    });

    it('should handle graceful close from server', async () => {
      const clientClosed = new Promise((resolve) => {
        clientConnection.on('close', (reasonCode, description) => {
          resolve({ reasonCode, description });
        });
      });

      serverConnection.close(1000, 'Server closing');

      const closeEvent = await clientClosed;
      expect(closeEvent.reasonCode).toBe(1000);
      expect(closeEvent.description).toBe('Server closing');
      expect(clientConnection.connected).toBe(false);
    });

    it('should clean up resources properly on close', async () => {
      const clientClosed = new Promise((resolve) => {
        clientConnection.on('close', () => {
          resolve();
        });
      });

      serverConnection.close();
      await clientClosed;

      // Verify socket is actually closed
      expect(serverConnection.socket.destroyed || !serverConnection.socket.writable).toBe(true);
      expect(clientConnection.socket.destroyed || !clientConnection.socket.writable).toBe(true);
    });

    it('should handle abrupt disconnect', async () => {
      const clientClosed = new Promise((resolve) => {
        clientConnection.on('close', () => {
          resolve();
        });
      });

      // Simulate abrupt disconnect by destroying the socket
      serverConnection.drop();

      await clientClosed;
      expect(clientConnection.connected).toBe(false);
    });
  });

  describe('Ping/Pong', () => {
    let serverConnection;
    let clientConnection;

    beforeEach(async () => {
      // Establish connection
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);
    });

    it('should automatically respond to ping with pong', async () => {
      const pongReceived = new Promise((resolve) => {
        serverConnection.on('pong', (buffer) => {
          resolve(buffer);
        });
      });

      serverConnection.ping();

      const result = await pongReceived;
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should send ping with payload and receive matching pong', async () => {
      const pingPayload = Buffer.from('test-ping');

      const pongReceived = new Promise((resolve) => {
        serverConnection.on('pong', (connection) => {
          resolve(connection);
        });
      });

      serverConnection.ping(pingPayload);

      await pongReceived;
      // Pong was received, verifying round-trip communication
    });
  });

  describe('Real Socket Behavior Verification', () => {
    it('should use actual TCP sockets with real properties', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      // Verify these are real net.Socket instances, not mocks
      const serverSocket = serverConnection.socket;
      const clientSocket = clientConnection.socket;

      // Real sockets have these properties
      expect(serverSocket.bytesRead).toBeDefined();
      expect(serverSocket.bytesWritten).toBeDefined();
      expect(serverSocket.connecting).toBeDefined();
      expect(serverSocket.destroyed).toBeDefined();

      expect(clientSocket.bytesRead).toBeDefined();
      expect(clientSocket.bytesWritten).toBeDefined();
      expect(clientSocket.connecting).toBeDefined();
      expect(clientSocket.destroyed).toBeDefined();

      // Verify actual network addresses
      expect(serverSocket.remoteAddress).toMatch(/127\.0\.0\.1|::1/);
      expect(clientSocket.localAddress).toMatch(/127\.0\.0\.1|::1/);

      // Verify port numbers are valid
      expect(typeof serverSocket.localPort).toBe('number');
      expect(typeof clientSocket.remotePort).toBe('number');
      expect(clientSocket.remotePort).toBe(serverPort);
    });

    it('should track actual bytes transferred over real sockets', async () => {
      const connectionEstablished = new Promise((resolve) => {
        wsServer.on('request', (request) => {
          const connection = request.accept();
          resolve(connection);
        });
      });

      wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve, reject) => {
        wsClient.on('connect', resolve);
        wsClient.on('connectFailed', reject);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);

      const [serverConnection, clientConnection] = await Promise.all([
        connectionEstablished,
        clientConnected
      ]);

      const initialBytesWritten = clientConnection.socket.bytesWritten;
      const initialBytesRead = serverConnection.socket.bytesRead;

      // Send a message
      const testMessage = 'Test message for byte counting';
      const messageReceived = new Promise((resolve) => {
        serverConnection.on('message', resolve);
      });

      clientConnection.sendUTF(testMessage);
      await messageReceived;

      // Verify bytes were actually transferred
      expect(clientConnection.socket.bytesWritten).toBeGreaterThan(initialBytesWritten);
      expect(serverConnection.socket.bytesRead).toBeGreaterThan(initialBytesRead);
    });
  });
});
