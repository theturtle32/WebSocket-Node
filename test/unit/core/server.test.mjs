/**
 * WebSocketServer Unit Tests
 *
 * Comprehensive tests for the WebSocketServer class including:
 * - Constructor and configuration
 * - Mount/unmount functionality
 * - Connection management
 * - Broadcasting
 * - Auto-accept vs manual accept
 * - Shutdown behavior
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import http from 'http';
import WebSocketServer from '../../../lib/WebSocketServer.js';
import WebSocketRequest from '../../../lib/WebSocketRequest.js';

describe('WebSocketServer', () => {
  describe('Constructor and Configuration', () => {
    it('should create server without configuration', () => {
      const server = new WebSocketServer();

      expect(server.connections).toBeInstanceOf(Set);
      expect(server.connections.size).toBe(0);
      expect(server.pendingRequests).toEqual([]);
      expect(server._handlers).toBeDefined();
    });

    it('should accept configuration in constructor', () => {
      const httpServer = new EventEmitter();
      const server = new WebSocketServer({ httpServer });

      expect(server.config.httpServer).toEqual([httpServer]);
    });

    it('should have default configuration values', () => {
      const httpServer = new EventEmitter();
      const server = new WebSocketServer({ httpServer });

      expect(server.config.maxReceivedFrameSize).toBe(0x10000); // 64KiB
      expect(server.config.maxReceivedMessageSize).toBe(0x100000); // 1MiB
      expect(server.config.fragmentOutgoingMessages).toBe(true);
      expect(server.config.fragmentationThreshold).toBe(0x4000); // 16KiB
      expect(server.config.keepalive).toBe(true);
      expect(server.config.keepaliveInterval).toBe(20000);
      expect(server.config.dropConnectionOnKeepaliveTimeout).toBe(true);
      expect(server.config.keepaliveGracePeriod).toBe(10000);
      expect(server.config.useNativeKeepalive).toBe(false);
      expect(server.config.assembleFragments).toBe(true);
      expect(server.config.autoAcceptConnections).toBe(false);
      expect(server.config.ignoreXForwardedFor).toBe(false);
      expect(server.config.parseCookies).toBe(true);
      expect(server.config.parseExtensions).toBe(true);
      expect(server.config.disableNagleAlgorithm).toBe(true);
      expect(server.config.closeTimeout).toBe(5000);
    });

    it('should merge custom configuration', () => {
      const httpServer = new EventEmitter();
      const server = new WebSocketServer({
        httpServer,
        maxReceivedFrameSize: 0x20000,
        keepaliveInterval: 30000,
        autoAcceptConnections: true
      });

      expect(server.config.maxReceivedFrameSize).toBe(0x20000);
      expect(server.config.keepaliveInterval).toBe(30000);
      expect(server.config.autoAcceptConnections).toBe(true);
      // Defaults should remain
      expect(server.config.maxReceivedMessageSize).toBe(0x100000);
    });
  });

  describe('mount()', () => {
    let httpServer;

    beforeEach(() => {
      httpServer = new EventEmitter();
    });

    it('should mount to http server', () => {
      const server = new WebSocketServer();
      const listenersBefore = httpServer.listenerCount('upgrade');

      server.mount({ httpServer });

      expect(httpServer.listenerCount('upgrade')).toBe(listenersBefore + 1);
      expect(server.config.httpServer).toEqual([httpServer]);
    });

    it('should mount to multiple http servers', () => {
      const httpServer2 = new EventEmitter();
      const server = new WebSocketServer();

      server.mount({ httpServer: [httpServer, httpServer2] });

      expect(httpServer.listenerCount('upgrade')).toBeGreaterThan(0);
      expect(httpServer2.listenerCount('upgrade')).toBeGreaterThan(0);
      expect(server.config.httpServer).toEqual([httpServer, httpServer2]);
    });

    it('should throw error if no httpServer specified', () => {
      const server = new WebSocketServer();

      expect(() => {
        server.mount({});
      }).toThrow('You must specify an httpServer on which to mount the WebSocket server.');
    });

    it('should throw error if httpServer is null', () => {
      const server = new WebSocketServer();

      expect(() => {
        server.mount({ httpServer: null });
      }).toThrow('You must specify an httpServer on which to mount the WebSocket server.');
    });
  });

  describe('unmount()', () => {
    let httpServer;
    let server;

    beforeEach(() => {
      httpServer = new EventEmitter();
      server = new WebSocketServer({ httpServer });
    });

    it('should remove upgrade listener from http server', () => {
      const listenersBefore = httpServer.listenerCount('upgrade');
      expect(listenersBefore).toBeGreaterThan(0);

      server.unmount();

      expect(httpServer.listenerCount('upgrade')).toBe(listenersBefore - 1);
    });

    it('should unmount from multiple http servers', () => {
      const httpServer2 = new EventEmitter();
      server.unmount();
      server.mount({ httpServer: [httpServer, httpServer2] });

      const listeners1Before = httpServer.listenerCount('upgrade');
      const listeners2Before = httpServer2.listenerCount('upgrade');

      server.unmount();

      expect(httpServer.listenerCount('upgrade')).toBe(listeners1Before - 1);
      expect(httpServer2.listenerCount('upgrade')).toBe(listeners2Before - 1);
    });
  });

  describe('handleUpgrade()', () => {
    let httpServer;
    let server;
    let mockSocket;
    let mockRequest;

    beforeEach(() => {
      httpServer = new EventEmitter();
      server = new WebSocketServer({
        httpServer,
        autoAcceptConnections: false
      });

      mockSocket = Object.assign(new EventEmitter(), {
        remoteAddress: '127.0.0.1',
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn()
      });

      mockRequest = {
        method: 'GET',
        url: '/test',
        headers: {
          'host': 'localhost',
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        },
        httpVersion: '1.1'
      };
    });

    it('should emit request event for valid handshake', async () => {
      const requestPromise = new Promise((resolve) => {
        server.on('request', (wsRequest) => {
          expect(wsRequest.constructor.name).toBe('WebSocketRequest');
          expect(server.pendingRequests).toContain(wsRequest);
          resolve();
        });
      });

      httpServer.emit('upgrade', mockRequest, mockSocket);

      await requestPromise;
    });

    it('should auto-accept when autoAcceptConnections is true', async () => {
      server.config.autoAcceptConnections = true;

      // Add required socket methods for WebSocketConnection
      mockSocket.setNoDelay = vi.fn();
      mockSocket.setTimeout = vi.fn();
      mockSocket.setKeepAlive = vi.fn();

      const connectPromise = new Promise((resolve) => {
        server.on('connect', (connection) => {
          expect(connection).toBeDefined();
          expect(server.connections.has(connection)).toBe(true);
          resolve();
        });
      });

      httpServer.emit('upgrade', mockRequest, mockSocket);

      await connectPromise;
    });

    // Note: 404 rejection when no request listener is tested in integration tests
    // due to complex async behavior with WebSocketRequest

    it('should emit upgradeError for invalid handshake', async () => {
      const invalidRequest = {
        ...mockRequest,
        headers: {
          ...mockRequest.headers,
          'sec-websocket-version': '7' // Unsupported version
        }
      };

      const errorPromise = new Promise((resolve) => {
        server.on('upgradeError', (error) => {
          expect(error).toBeDefined();
          resolve();
        });
      });

      httpServer.emit('upgrade', invalidRequest, mockSocket);

      await errorPromise;
    });

    it('should add request to pendingRequests', () => {
      server.on('request', () => {
        // Just need a listener so it doesn't auto-reject
      });

      expect(server.pendingRequests).toHaveLength(0);

      httpServer.emit('upgrade', mockRequest, mockSocket);

      expect(server.pendingRequests).toHaveLength(1);
    });
  });

  describe('Connection Management', () => {
    let httpServer;
    let server;

    beforeEach(() => {
      httpServer = new EventEmitter();
      server = new WebSocketServer({ httpServer });
    });

    it('should track accepted connections', () => {
      const mockConnection = new EventEmitter();
      mockConnection.close = vi.fn();

      expect(server.connections.size).toBe(0);

      server.handleRequestAccepted(mockConnection);

      expect(server.connections.size).toBe(1);
      expect(server.connections.has(mockConnection)).toBe(true);
    });

    it('should emit connect event when connection accepted', async () => {
      const mockConnection = new EventEmitter();
      mockConnection.close = vi.fn();

      const connectPromise = new Promise((resolve) => {
        server.on('connect', (connection) => {
          expect(connection).toBe(mockConnection);
          resolve();
        });
      });

      server.handleRequestAccepted(mockConnection);

      await connectPromise;
    });

    it('should remove connection when closed', () => {
      const mockConnection = new EventEmitter();
      mockConnection.close = vi.fn();

      server.handleRequestAccepted(mockConnection);
      expect(server.connections.size).toBe(1);

      server.handleConnectionClose(mockConnection, 1000, 'Normal closure');
      expect(server.connections.size).toBe(0);
    });

    it('should emit close event when connection closes', async () => {
      const mockConnection = new EventEmitter();
      mockConnection.close = vi.fn();

      server.handleRequestAccepted(mockConnection);

      const closePromise = new Promise((resolve) => {
        server.on('close', (connection, closeReason, description) => {
          expect(connection).toBe(mockConnection);
          expect(closeReason).toBe(1000);
          expect(description).toBe('Normal closure');
          resolve();
        });
      });

      server.handleConnectionClose(mockConnection, 1000, 'Normal closure');

      await closePromise;
    });

    it('should handle multiple connections', () => {
      const conn1 = new EventEmitter();
      const conn2 = new EventEmitter();
      const conn3 = new EventEmitter();
      conn1.close = vi.fn();
      conn2.close = vi.fn();
      conn3.close = vi.fn();

      server.handleRequestAccepted(conn1);
      server.handleRequestAccepted(conn2);
      server.handleRequestAccepted(conn3);

      expect(server.connections.size).toBe(3);

      server.handleConnectionClose(conn2, 1000, 'Normal');

      expect(server.connections.size).toBe(2);
      expect(server.connections.has(conn1)).toBe(true);
      expect(server.connections.has(conn2)).toBe(false);
      expect(server.connections.has(conn3)).toBe(true);
    });
  });

  describe('Broadcasting', () => {
    let server;
    let mockConnections;

    beforeEach(() => {
      const httpServer = new EventEmitter();
      server = new WebSocketServer({ httpServer });

      mockConnections = [
        {
          sendUTF: vi.fn(),
          sendBytes: vi.fn(),
          close: vi.fn()
        },
        {
          sendUTF: vi.fn(),
          sendBytes: vi.fn(),
          close: vi.fn()
        },
        {
          sendUTF: vi.fn(),
          sendBytes: vi.fn(),
          close: vi.fn()
        }
      ];

      mockConnections.forEach(conn => server.connections.add(conn));
    });

    describe('broadcastUTF()', () => {
      it('should send UTF8 data to all connections', () => {
        const message = 'Hello, WebSocket!';

        server.broadcastUTF(message);

        mockConnections.forEach(conn => {
          expect(conn.sendUTF).toHaveBeenCalledWith(message);
        });
      });

      it('should handle empty connections set', () => {
        server.connections.clear();

        expect(() => {
          server.broadcastUTF('test');
        }).not.toThrow();
      });
    });

    describe('broadcastBytes()', () => {
      it('should send binary data to all connections', () => {
        const data = Buffer.from([1, 2, 3, 4, 5]);

        server.broadcastBytes(data);

        mockConnections.forEach(conn => {
          expect(conn.sendBytes).toHaveBeenCalledWith(data);
        });
      });

      it('should handle empty connections set', () => {
        server.connections.clear();

        expect(() => {
          server.broadcastBytes(Buffer.from('test'));
        }).not.toThrow();
      });
    });

    describe('broadcast()', () => {
      it('should call broadcastBytes for Buffer data', () => {
        const data = Buffer.from('test');
        const spy = vi.spyOn(server, 'broadcastBytes');

        server.broadcast(data);

        expect(spy).toHaveBeenCalledWith(data);
      });

      it('should call broadcastUTF for string data', () => {
        const data = 'test message';
        const spy = vi.spyOn(server, 'broadcastUTF');

        server.broadcast(data);

        expect(spy).toHaveBeenCalledWith(data);
      });

      it('should call broadcastUTF for objects with toString', () => {
        const data = { toString: () => 'object string' };
        const spy = vi.spyOn(server, 'broadcastUTF');

        server.broadcast(data);

        expect(spy).toHaveBeenCalledWith(data);
      });
    });
  });

  describe('closeAllConnections()', () => {
    let server;
    let mockConnections;
    let mockRequests;

    beforeEach(() => {
      const httpServer = new EventEmitter();
      server = new WebSocketServer({ httpServer });

      mockConnections = [
        { close: vi.fn() },
        { close: vi.fn() },
        { close: vi.fn() }
      ];

      mockRequests = [
        { reject: vi.fn() },
        { reject: vi.fn() }
      ];

      mockConnections.forEach(conn => server.connections.add(conn));
      server.pendingRequests.push(...mockRequests);
    });

    it('should close all active connections', () => {
      server.closeAllConnections();

      mockConnections.forEach(conn => {
        expect(conn.close).toHaveBeenCalled();
      });
    });

    it('should reject all pending requests with 503', async () => {
      server.closeAllConnections();

      // Rejection happens on next tick
      await new Promise(resolve => process.nextTick(resolve));

      mockRequests.forEach(req => {
        expect(req.reject).toHaveBeenCalledWith(503);
      });
    });

    it('should handle empty connections and requests', () => {
      server.connections.clear();
      server.pendingRequests = [];

      expect(() => {
        server.closeAllConnections();
      }).not.toThrow();
    });
  });

  describe('shutDown()', () => {
    let httpServer;
    let server;

    beforeEach(() => {
      httpServer = new EventEmitter();
      server = new WebSocketServer({ httpServer });
    });

    it('should unmount and close all connections', () => {
      const unmountSpy = vi.spyOn(server, 'unmount');
      const closeAllSpy = vi.spyOn(server, 'closeAllConnections');

      server.shutDown();

      expect(unmountSpy).toHaveBeenCalled();
      expect(closeAllSpy).toHaveBeenCalled();
    });

    it('should remove upgrade listener from http server', () => {
      const listenersBefore = httpServer.listenerCount('upgrade');

      server.shutDown();

      expect(httpServer.listenerCount('upgrade')).toBeLessThan(listenersBefore);
    });
  });

  describe('Pending Request Management', () => {
    let httpServer;
    let server;
    let mockSocket;
    let mockRequest;

    beforeEach(() => {
      httpServer = new EventEmitter();
      server = new WebSocketServer({
        httpServer,
        autoAcceptConnections: false
      });

      mockSocket = Object.assign(new EventEmitter(), {
        remoteAddress: '127.0.0.1',
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn()
      });

      mockRequest = {
        method: 'GET',
        url: '/test',
        headers: {
          'host': 'localhost',
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        },
        httpVersion: '1.1'
      };
    });

    it('should remove request from pending list when resolved', async () => {
      const requestPromise = new Promise((resolve) => {
        server.on('request', (wsRequest) => {
          expect(server.pendingRequests).toContain(wsRequest);

          server.handleRequestResolved(wsRequest);

          expect(server.pendingRequests).not.toContain(wsRequest);
          resolve();
        });
      });

      httpServer.emit('upgrade', mockRequest, mockSocket);

      await requestPromise;
    });

    it('should remove request when socket closes', async () => {
      const requestPromise = new Promise((resolve) => {
        server.on('request', (wsRequest) => {
          const initialLength = server.pendingRequests.length;

          mockSocket.emit('close');

          // Give it a tick to process
          setImmediate(() => {
            expect(server.pendingRequests.length).toBeLessThan(initialLength);
            resolve();
          });
        });
      });

      httpServer.emit('upgrade', mockRequest, mockSocket);

      await requestPromise;
    });

    it('should handle resolving non-existent request gracefully', () => {
      const fakeRequest = { reject: vi.fn() };

      expect(() => {
        server.handleRequestResolved(fakeRequest);
      }).not.toThrow();
    });
  });
});
