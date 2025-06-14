import http from 'http';
import https from 'https';
import WebSocketServer from '../../lib/WebSocketServer.js';
import { EventEmitter } from 'events';

const activeServers = new Set();

export class TestServerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.server = null;
    this.wsServer = null;
    this.port = null;
    this.connections = new Set();
    this.messageHistory = [];
    this.options = {
      autoAcceptConnections: false,
      maxReceivedFrameSize: 64 * 1024 * 1024,
      maxReceivedMessageSize: 64 * 1024 * 1024,
      fragmentOutgoingMessages: false,
      keepalive: false,
      disableNagleAlgorithm: false,
      ssl: false,
      ...options
    };
  }

  async start(port = 0) {
    return new Promise((resolve, reject) => {
      // Create HTTP or HTTPS server
      if (this.options.ssl) {
        this.server = https.createServer(this.options.ssl, this._handleHttpRequest.bind(this));
      } else {
        this.server = http.createServer(this._handleHttpRequest.bind(this));
      }

      this.wsServer = new WebSocketServer({
        httpServer: this.server,
        ...this.options
      });

      this._setupWebSocketHandlers();

      this.server.listen(port, (err) => {
        if (err) {
          return reject(err);
        }
        this.port = this.server.address().port;
        activeServers.add(this);
        this.emit('listening', this.port);
        resolve(this);
      });
    });
  }

  async stop() {
    return new Promise((resolve, reject) => {
      try {
        // Close all connections
        for (const connection of this.connections) {
          connection.close();
        }
        this.connections.clear();

        if (this.wsServer) {
          this.wsServer.shutDown();
        }
        
        if (this.server) {
          this.server.close(() => {
            activeServers.delete(this);
            this.emit('closed');
            resolve();
          });
        } else {
          resolve();
        }
      } catch (e) {
        // In test environment, we want to know about cleanup issues but not fail tests
        if (process.env.NODE_ENV === 'test') {
          console.warn('Warning: Server cleanup encountered an error:', e.message);
          resolve(); // Don't fail tests during cleanup
        } else {
          reject(e); // In non-test environments, propagate the error
        }
      }
    });
  }

  getPort() {
    return this.port;
  }

  getURL(protocol = 'ws') {
    const scheme = this.options.ssl ? 'wss' : 'ws';
    return `${scheme}://localhost:${this.port}/`;
  }

  getConnections() {
    return Array.from(this.connections);
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getMessageHistory() {
    return [...this.messageHistory];
  }

  clearMessageHistory() {
    this.messageHistory = [];
  }

  broadcastUTF(message) {
    for (const connection of this.connections) {
      if (connection.connected) {
        connection.sendUTF(message);
      }
    }
  }

  broadcastBytes(data) {
    for (const connection of this.connections) {
      if (connection.connected) {
        connection.sendBytes(data);
      }
    }
  }

  closeAllConnections(reasonCode = 1000, description = 'Server shutdown') {
    for (const connection of this.connections) {
      connection.close(reasonCode, description);
    }
  }

  _handleHttpRequest(request, response) {
    response.writeHead(404);
    response.end();
    this.emit('httpRequest', request, response);
  }

  _setupWebSocketHandlers() {
    this.wsServer.on('request', (request) => {
      this.emit('request', request);
      
      if (this.options.autoAcceptConnections) {
        const connection = request.accept();
        this._handleConnection(connection);
      }
    });

    this.wsServer.on('connect', (connection) => {
      this._handleConnection(connection);
    });
  }

  _handleConnection(connection) {
    this.connections.add(connection);
    this.emit('connection', connection);

    connection.on('message', (message) => {
      this.messageHistory.push({
        timestamp: new Date(),
        type: message.type,
        data: message.type === 'utf8' ? message.utf8Data : message.binaryData,
        connection
      });
      this.emit('message', message, connection);
    });

    connection.on('close', (reasonCode, description) => {
      this.connections.delete(connection);
      this.emit('connectionClose', reasonCode, description, connection);
    });

    connection.on('error', (error) => {
      this.emit('connectionError', error, connection);
    });
  }
}

// Legacy API compatibility
let defaultServer;

export async function prepare(options = {}) {
  defaultServer = new TestServerManager(options);
  return defaultServer.start();
}

export function getPort() {
  return defaultServer?.getPort();
}

export async function stopServer() {
  if (defaultServer) {
    await defaultServer.stop();
    defaultServer = null;
  }
}

// Helper functions for common test scenarios
export async function createEchoServer(options = {}) {
  const server = new TestServerManager({
    autoAcceptConnections: true,
    ...options
  });

  await server.start();

  server.on('message', (message, connection) => {
    if (message.type === 'utf8') {
      connection.sendUTF(message.utf8Data);
    } else {
      connection.sendBytes(message.binaryData);
    }
  });

  return server;
}

export async function createBroadcastServer(options = {}) {
  const server = new TestServerManager({
    autoAcceptConnections: true,
    ...options
  });

  await server.start();

  server.on('message', (message, connection) => {
    // Broadcast to all other connections
    for (const conn of server.getConnections()) {
      if (conn !== connection && conn.connected) {
        if (message.type === 'utf8') {
          conn.sendUTF(message.utf8Data);
        } else {
          conn.sendBytes(message.binaryData);
        }
      }
    }
  });

  return server;
}

export async function createProtocolTestServer(protocols = ['test'], options = {}) {
  const server = new TestServerManager(options);

  await server.start();

  server.on('request', (request) => {
    const requestedProtocols = request.requestedProtocols;
    const protocol = requestedProtocols.find(p => protocols.includes(p));
    
    if (protocol) {
      const connection = request.accept(protocol);
    } else {
      request.reject(406, 'Unsupported protocol');
    }
  });

  return server;
}

export async function createDelayedResponseServer(delay = 1000, options = {}) {
  const server = new TestServerManager(options);

  await server.start();

  server.on('request', (request) => {
    setTimeout(() => {
      const connection = request.accept();
    }, delay);
  });

  return server;
}

// Cleanup function to stop all active servers
export async function stopAllServers() {
  const stopPromises = Array.from(activeServers).map(server => server.stop());
  await Promise.all(stopPromises);
  activeServers.clear();
}

// Auto-cleanup on process exit
process.on('exit', () => {
  for (const server of activeServers) {
    try {
      server.stop();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
});