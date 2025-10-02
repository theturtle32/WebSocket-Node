import { EventEmitter } from 'events';
import http from 'http';

export class MockWebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.connections = new Set();
    this.options = {
      autoAcceptConnections: false,
      maxReceivedFrameSize: 64 * 1024 * 1024,
      maxReceivedMessageSize: 64 * 1024 * 1024,
      ...options
    };
    this.isShuttingDown = false;
  }

  mount(config) {
    this.config = config;
    return this;
  }

  addConnection(connection) {
    this.connections.add(connection);
    this.emit('connect', connection);
  }

  removeConnection(connection) {
    this.connections.delete(connection);
  }

  shutDown() {
    this.isShuttingDown = true;
    for (const connection of this.connections) {
      connection.close();
    }
    this.connections.clear();
    this.emit('shutdown');
  }

  getConnectionCount() {
    return this.connections.size;
  }

  broadcast(message) {
    for (const connection of this.connections) {
      if (connection.connected) {
        connection.sendUTF(message);
      }
    }
  }
}

export class MockWebSocketClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = null;
    this.protocol = null;
    this.readyState = 'CLOSED';
    this.connection = null;
    this.options = {
      maxReceivedFrameSize: 64 * 1024 * 1024,
      maxReceivedMessageSize: 64 * 1024 * 1024,
      ...options
    };
  }

  connect(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.readyState = 'CONNECTING';
    
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 'OPEN';
      this.emit('connect', this.connection);
    }, 10);
  }

  send(data) {
    if (this.readyState !== 'OPEN') {
      throw new Error('Connection not open');
    }
    this.emit('send', data);
  }

  close() {
    this.readyState = 'CLOSING';
    setTimeout(() => {
      this.readyState = 'CLOSED';
      this.emit('close');
    }, 5);
  }

  simulateMessage(message) {
    if (this.readyState === 'OPEN') {
      this.emit('message', { utf8Data: message });
    }
  }

  simulateError(error) {
    this.emit('connectFailed', error);
  }
}

export class MockWebSocketConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.connected = true;
    this.state = 'open';
    this.remoteAddress = options.remoteAddress || '127.0.0.1';
    this.webSocketVersion = options.webSocketVersion || 13;
    this.protocol = options.protocol || null;
    this.extensions = options.extensions || [];
    this.closeCode = null;
    this.closeReasonCode = null;
    this.sentFrames = [];
    this.receivedFrames = [];
  }

  sendUTF(data) {
    if (!this.connected) {
      throw new Error('Connection is closed');
    }
    this.sentFrames.push({ type: 'utf8', data });
    this.emit('message', { type: 'utf8', utf8Data: data });
  }

  sendBytes(data) {
    if (!this.connected) {
      throw new Error('Connection is closed');
    }
    this.sentFrames.push({ type: 'binary', data });
    this.emit('message', { type: 'binary', binaryData: data });
  }

  ping(data) {
    if (!this.connected) {
      throw new Error('Connection is closed');
    }
    this.sentFrames.push({ type: 'ping', data });
    // Auto-respond with pong
    setTimeout(() => this.emit('pong', data), 1);
  }

  pong(data) {
    if (!this.connected) {
      throw new Error('Connection is closed');
    }
    this.sentFrames.push({ type: 'pong', data });
  }

  close(reasonCode, description) {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this.state = 'closed';
    this.closeCode = reasonCode;
    this.closeReasonCode = description;
    this.emit('close', reasonCode, description);
  }

  drop(reasonCode, description) {
    this.close(reasonCode, description);
  }

  simulateIncomingMessage(data, type = 'utf8') {
    if (!this.connected) {
      return;
    }
    const frame = { type, [type === 'utf8' ? 'utf8Data' : 'binaryData']: data };
    this.receivedFrames.push(frame);
    this.emit('message', frame);
  }

  simulateError(error) {
    this.emit('error', error);
  }

  getSentFrames() {
    return [...this.sentFrames];
  }

  getReceivedFrames() {
    return [...this.receivedFrames];
  }

  clearFrameHistory() {
    this.sentFrames = [];
    this.receivedFrames = [];
  }
}

export class MockHTTPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.listening = false;
    this.port = null;
    this.address = null;
    this.connections = new Set();
    this.options = options;
  }

  listen(port, hostname, callback) {
    if (typeof hostname === 'function') {
      callback = hostname;
      hostname = 'localhost';
    }
    
    // Simulate async listen
    setTimeout(() => {
      this.listening = true;
      this.port = port || 0;
      this.address = { port: this.port, address: hostname || 'localhost' };
      this.emit('listening');
      if (callback) callback();
    }, 5);
    
    return this;
  }

  close(callback) {
    this.listening = false;
    for (const connection of this.connections) {
      connection.destroy();
    }
    this.connections.clear();
    
    setTimeout(() => {
      this.emit('close');
      if (callback) callback();
    }, 5);
    
    return this;
  }

  address() {
    return this.address;
  }

  simulateRequest(request, response) {
    this.emit('request', request, response);
  }

  simulateUpgrade(request, socket, head) {
    this.emit('upgrade', request, socket, head);
  }

  addConnection(connection) {
    this.connections.add(connection);
  }

  removeConnection(connection) {
    this.connections.delete(connection);
  }
}

export class MockSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    this.readable = true;
    this.writable = true;
    this.destroyed = false;
    this.remoteAddress = options.remoteAddress || '127.0.0.1';
    this.remotePort = options.remotePort || 12345;
    this.writtenData = [];
  }

  write(data, encoding, callback) {
    if (this.destroyed) {
      throw new Error('Socket is destroyed');
    }
    this.writtenData.push(data);
    if (callback) setTimeout(callback, 1);
    return true;
  }

  end(data, encoding, callback) {
    if (data) {
      this.write(data, encoding);
    }
    this.writable = false;
    setTimeout(() => {
      this.emit('end');
      if (callback) callback();
    }, 1);
  }

  destroy() {
    this.destroyed = true;
    this.readable = false;
    this.writable = false;
    this.emit('close');
  }

  pause() {
    this.emit('pause');
  }

  resume() {
    this.emit('resume');
  }

  setTimeout(timeout, callback) {
    if (callback) {
      setTimeout(callback, timeout);
    }
  }

  setNoDelay(noDelay) {
    // Mock implementation for TCP_NODELAY
    this.noDelay = noDelay;
  }

  setKeepAlive(enable, initialDelay) {
    // Mock implementation for keepalive
    this.keepAlive = enable;
    this.keepAliveInitialDelay = initialDelay;
  }

  removeAllListeners(event) {
    if (event) {
      super.removeAllListeners(event);
    } else {
      super.removeAllListeners();
    }
  }

  on(event, listener) {
    return super.on(event, listener);
  }

  simulateData(data) {
    if (!this.destroyed && this.readable) {
      this.emit('data', Buffer.isBuffer(data) ? data : Buffer.from(data));
    }
  }

  simulateError(error) {
    this.emit('error', error);
  }

  simulateDrain() {
    this.emit('drain');
  }

  getWrittenData() {
    return this.writtenData;
  }

  clearWrittenData() {
    this.writtenData = [];
  }
}