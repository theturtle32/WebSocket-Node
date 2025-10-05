/**
 * WebSocketRouter Integration Tests
 *
 * Tests WebSocketRouter with real Node.js sockets and multiple clients.
 * Validates that routing logic works correctly with actual network traffic.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import WebSocketServer from '../../../lib/WebSocketServer.js';
import WebSocketRouter from '../../../lib/WebSocketRouter.js';
import WebSocketClient from '../../../lib/WebSocketClient.js';

describe('WebSocketRouter Integration', () => {
  let httpServer;
  let wsServer;
  let router;
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

    // Create router
    router = new WebSocketRouter();
    router.attachServer(wsServer);

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

    // Detach router
    if (router) {
      try {
        router.detachServer();
      } catch (e) {
        // Ignore cleanup errors
      }
      router = null;
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

  describe('Path Routing', () => {
    it('should route to correct handler based on path', async () => {
      let echoConnection;
      let broadcastConnection;

      // Mount echo handler on /echo
      router.mount('/echo', null, (request) => {
        echoConnection = request.accept();
        echoConnection.on('message', (message) => {
          if (message.type === 'utf8') {
            echoConnection.sendUTF(message.utf8Data);
          }
        });
      });

      // Mount broadcast handler on /broadcast
      router.mount('/broadcast', null, (request) => {
        broadcastConnection = request.accept();
      });

      // Connect to /echo
      const wsClient1 = new WebSocketClient();
      const client1Connected = new Promise((resolve) => {
        wsClient1.on('connect', resolve);
      });
      wsClient1.connect(`ws://127.0.0.1:${serverPort}/echo`, null);
      const connection1 = await client1Connected;

      // Test echo functionality
      const echoReceived = new Promise((resolve) => {
        connection1.on('message', (message) => {
          resolve(message.utf8Data);
        });
      });
      connection1.sendUTF('test message');
      const echoed = await echoReceived;
      expect(echoed).toBe('test message');

      // Connect to /broadcast
      const wsClient2 = new WebSocketClient();
      const client2Connected = new Promise((resolve) => {
        wsClient2.on('connect', resolve);
      });
      wsClient2.connect(`ws://127.0.0.1:${serverPort}/broadcast`, null);
      await client2Connected;

      // Verify different handlers were used
      expect(echoConnection).toBeDefined();
      expect(broadcastConnection).toBeDefined();
      expect(echoConnection).not.toBe(broadcastConnection);

      // Clean up
      wsClient1.abort();
      wsClient2.abort();
    });

    it('should reject requests to unmounted paths', async () => {
      // Mount handler only on /valid
      router.mount('/valid', null, (request) => {
        request.accept();
      });

      // Try to connect to /invalid
      const wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/invalid`, null);

      const error = await connectionFailed;
      expect(error).toBeDefined();
      expect(error.toString()).toContain('404');

      // Clean up
      wsClient.abort();
    });

    it('should support wildcard path matching', async () => {
      let matchedPath;

      // Mount wildcard handler
      router.mount('*', null, (request) => {
        matchedPath = request.resourceURL.pathname;
        request.accept();
      });

      // Connect to arbitrary path
      const wsClient = new WebSocketClient();
      const clientConnected = new Promise((resolve) => {
        wsClient.on('connect', resolve);
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/any/path/here`, null);
      await clientConnected;

      expect(matchedPath).toBe('/any/path/here');

      // Clean up
      wsClient.abort();
    });

  });

  describe('Protocol Routing', () => {
    it('should route based on protocol', async () => {
      let protocol1Connection;
      let protocol2Connection;

      // Mount handlers for different protocols on same path
      router.mount('/test', 'protocol1', (request) => {
        protocol1Connection = request.accept('protocol1');
      });

      router.mount('/test', 'protocol2', (request) => {
        protocol2Connection = request.accept('protocol2');
      });

      // Connect with protocol1
      const wsClient1 = new WebSocketClient();
      const client1Connected = new Promise((resolve) => {
        wsClient1.on('connect', resolve);
      });
      wsClient1.connect(`ws://127.0.0.1:${serverPort}/test`, 'protocol1');
      const connection1 = await client1Connected;
      expect(connection1.protocol).toBe('protocol1');

      // Connect with protocol2
      const wsClient2 = new WebSocketClient();
      const client2Connected = new Promise((resolve) => {
        wsClient2.on('connect', resolve);
      });
      wsClient2.connect(`ws://127.0.0.1:${serverPort}/test`, 'protocol2');
      const connection2 = await client2Connected;
      expect(connection2.protocol).toBe('protocol2');

      // Verify different handlers were used
      expect(protocol1Connection).not.toBe(protocol2Connection);

      // Clean up
      wsClient1.abort();
      wsClient2.abort();
    });


    it('should reject mismatched protocol', async () => {
      // Mount handler for specific protocol
      router.mount('/test', 'required-protocol', (request) => {
        request.accept('required-protocol');
      });

      // Try to connect with wrong protocol
      const wsClient = new WebSocketClient();
      const connectionFailed = new Promise((resolve) => {
        wsClient.on('connectFailed', (error) => {
          resolve(error);
        });
      });

      wsClient.connect(`ws://127.0.0.1:${serverPort}/test`, 'wrong-protocol');

      const error = await connectionFailed;
      expect(error).toBeDefined();
      expect(error.toString()).toContain('404');

      // Clean up
      wsClient.abort();
    });
  });

  describe('Multiple Clients', () => {
    it('should handle multiple simultaneous connections', async () => {
      const connections = [];

      // Mount handler that accepts all connections
      router.mount('*', null, (request) => {
        const connection = request.accept();
        connections.push(connection);

        connection.on('message', (message) => {
          // Echo back with client number
          const clientNum = connections.indexOf(connection) + 1;
          if (message.type === 'utf8') {
            connection.sendUTF(`Client ${clientNum}: ${message.utf8Data}`);
          }
        });
      });

      // Create 5 simultaneous clients
      const clients = [];
      const clientConnections = [];

      for (let i = 0; i < 5; i++) {
        const wsClient = new WebSocketClient();
        clients.push(wsClient);

        const connected = new Promise((resolve) => {
          wsClient.on('connect', resolve);
        });

        wsClient.connect(`ws://127.0.0.1:${serverPort}/`, null);
        const connection = await connected;
        clientConnections.push(connection);
      }

      expect(clientConnections).toHaveLength(5);
      expect(connections).toHaveLength(5);

      // Send messages from each client
      const messages = await Promise.all(
        clientConnections.map((conn, idx) => {
          return new Promise((resolve) => {
            conn.on('message', (message) => {
              resolve(message.utf8Data);
            });
            conn.sendUTF(`Message from client ${idx + 1}`);
          });
        })
      );

      // Verify each client got correct response
      for (let i = 0; i < 5; i++) {
        expect(messages[i]).toContain(`Client ${i + 1}`);
      }

      // Clean up
      for (const client of clients) {
        client.abort();
      }
    });

    it('should isolate connections properly', async () => {
      const receivedMessages = new Map();

      // Mount handler
      router.mount('*', null, (request) => {
        const connection = request.accept();
        const clientPath = request.resourceURL.pathname;

        receivedMessages.set(clientPath, []);

        connection.on('message', (message) => {
          if (message.type === 'utf8') {
            receivedMessages.get(clientPath).push(message.utf8Data);
          }
        });
      });

      // Create two clients
      const wsClient1 = new WebSocketClient();
      const client1Connected = new Promise((resolve) => {
        wsClient1.on('connect', resolve);
      });
      wsClient1.connect(`ws://127.0.0.1:${serverPort}/client1`, null);
      const connection1 = await client1Connected;

      const wsClient2 = new WebSocketClient();
      const client2Connected = new Promise((resolve) => {
        wsClient2.on('connect', resolve);
      });
      wsClient2.connect(`ws://127.0.0.1:${serverPort}/client2`, null);
      const connection2 = await client2Connected;

      // Send different messages
      connection1.sendUTF('Message for client 1');
      connection2.sendUTF('Message for client 2');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify messages are isolated to correct keys
      expect(receivedMessages.get('/client1')).toEqual(['Message for client 1']);
      expect(receivedMessages.get('/client2')).toEqual(['Message for client 2']);

      // Clean up
      wsClient1.abort();
      wsClient2.abort();
    });
  });

});
