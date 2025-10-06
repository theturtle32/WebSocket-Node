/**
 * WebSocketRouter Unit Tests
 *
 * Comprehensive tests for the WebSocketRouter class including:
 * - Constructor and configuration
 * - Server attachment/detachment
 * - Route mounting/unmounting
 * - Path matching (strings, wildcards, RegExp)
 * - Protocol matching
 * - Request routing priority
 * - Error handling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import WebSocketRouter from '../../../lib/WebSocketRouter.js';
import WebSocketServer from '../../../lib/WebSocketServer.js';
import WebSocketRouterRequest from '../../../lib/WebSocketRouterRequest.js';

describe('WebSocketRouter', () => {
  describe('Constructor and Configuration', () => {
    it('should create router without configuration', () => {
      const router = new WebSocketRouter();

      expect(router.handlers).toEqual([]);
      expect(router.config.server).toBe(null);
      expect(router._requestHandler).toBeDefined();
    });

    it('should accept server in constructor', () => {
      const mockServer = new EventEmitter();
      mockServer.on = vi.fn();

      const router = new WebSocketRouter({ server: mockServer });

      expect(router.server).toBe(mockServer);
    });
  });

  describe('attachServer()', () => {
    let router;
    let mockServer;

    beforeEach(() => {
      router = new WebSocketRouter();
      mockServer = new EventEmitter();
    });

    it('should attach to WebSocket server', () => {
      const listenersBefore = mockServer.listenerCount('request');

      router.attachServer(mockServer);

      expect(router.server).toBe(mockServer);
      expect(mockServer.listenerCount('request')).toBe(listenersBefore + 1);
    });

    it('should throw error if no server provided', () => {
      expect(() => {
        router.attachServer(null);
      }).toThrow('You must specify a WebSocketServer instance to attach to.');
    });

    it('should throw error if undefined server provided', () => {
      expect(() => {
        router.attachServer(undefined);
      }).toThrow('You must specify a WebSocketServer instance to attach to.');
    });
  });

  describe('detachServer()', () => {
    let router;
    let mockServer;

    beforeEach(() => {
      router = new WebSocketRouter();
      mockServer = new EventEmitter();
      router.attachServer(mockServer);
    });

    it('should detach from WebSocket server', () => {
      const listenersBefore = mockServer.listenerCount('request');

      router.detachServer();

      expect(router.server).toBe(null);
      expect(mockServer.listenerCount('request')).toBe(listenersBefore - 1);
    });

    it('should throw error if not attached', () => {
      router.detachServer(); // First detach

      expect(() => {
        router.detachServer(); // Try to detach again
      }).toThrow('Cannot detach from server: not attached.');
    });
  });

  describe('mount()', () => {
    let router;

    beforeEach(() => {
      router = new WebSocketRouter();
    });

    it('should mount handler for specific path and protocol', () => {
      const callback = vi.fn();

      router.mount('/test', 'echo-protocol', callback);

      expect(router.handlers).toHaveLength(1);
      expect(router.handlers[0].pathString).toBe('/^\\/test$/');
      expect(router.handlers[0].protocol).toBe('echo-protocol');
      expect(router.handlers[0].callback).toBe(callback);
    });

    it('should convert string path to RegExp', () => {
      const callback = vi.fn();

      router.mount('/api/websocket', 'test', callback);

      expect(router.handlers[0].path).toBeInstanceOf(RegExp);
      expect(router.handlers[0].path.test('/api/websocket')).toBe(true);
      expect(router.handlers[0].path.test('/api/other')).toBe(false);
    });

    it('should handle wildcard path', () => {
      const callback = vi.fn();

      router.mount('*', 'test', callback);

      expect(router.handlers[0].path).toBeInstanceOf(RegExp);
      expect(router.handlers[0].path.test('/any/path')).toBe(true);
      expect(router.handlers[0].path.test('/')).toBe(true);
    });

    it('should accept RegExp as path', () => {
      const callback = vi.fn();
      const pathRegex = /^\/api\/.*$/;

      router.mount(pathRegex, 'test', callback);

      expect(router.handlers[0].path).toBe(pathRegex);
      expect(router.handlers[0].path.test('/api/test')).toBe(true);
      expect(router.handlers[0].path.test('/other')).toBe(false);
    });

    it('should escape special regex characters in string paths', () => {
      const callback = vi.fn();

      router.mount('/test.path', 'test', callback);

      // Should match /test.path literally, not /test followed by any char
      expect(router.handlers[0].path.test('/test.path')).toBe(true);
      expect(router.handlers[0].path.test('/testXpath')).toBe(false);
    });

    it('should normalize protocol to lowercase', () => {
      const callback = vi.fn();

      router.mount('/test', 'Echo-Protocol', callback);

      expect(router.handlers[0].protocol).toBe('echo-protocol');
    });

    it('should use special value for no protocol', () => {
      const callback = vi.fn();

      router.mount('/test', null, callback);

      expect(router.handlers[0].protocol).toBe('____no_protocol____');
    });

    it('should throw error if no path provided', () => {
      expect(() => {
        router.mount(null, 'test', vi.fn());
      }).toThrow('You must specify a path for this handler.');
    });

    it('should throw error if no callback provided', () => {
      expect(() => {
        router.mount('/test', 'test', null);
      }).toThrow('You must specify a callback for this handler.');
    });

    it('should throw error for duplicate path/protocol combination', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      router.mount('/test', 'echo', callback1);

      expect(() => {
        router.mount('/test', 'echo', callback2);
      }).toThrow('You may only mount one handler per path/protocol combination.');
    });

    it('should allow same path with different protocols', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      router.mount('/test', 'echo', callback1);
      router.mount('/test', 'chat', callback2);

      expect(router.handlers).toHaveLength(2);
    });

    it('should allow same protocol with different paths', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      router.mount('/test1', 'echo', callback1);
      router.mount('/test2', 'echo', callback2);

      expect(router.handlers).toHaveLength(2);
    });
  });

  describe('unmount()', () => {
    let router;

    beforeEach(() => {
      router = new WebSocketRouter();
    });

    it('should unmount existing handler', () => {
      const callback = vi.fn();

      router.mount('/test', 'echo', callback);
      expect(router.handlers).toHaveLength(1);

      router.unmount('/test', 'echo');
      expect(router.handlers).toHaveLength(0);
    });

    it('should throw error for non-existent path/protocol', () => {
      expect(() => {
        router.unmount('/nonexistent', 'test');
      }).toThrow('Unable to find a route matching the specified path and protocol.');
    });

    it('should only unmount specific path/protocol combination', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      router.mount('/test', 'echo', callback1);
      router.mount('/test', 'chat', callback2);
      router.mount('/other', 'echo', callback3);

      router.unmount('/test', 'echo');

      expect(router.handlers).toHaveLength(2);
      expect(router.handlers.find(h => h.protocol === 'chat')).toBeDefined();
      expect(router.handlers.find(h => h.pathString.includes('other'))).toBeDefined();
    });

    it('should handle RegExp path unmounting', () => {
      const callback = vi.fn();
      const pathRegex = /^\/api\/.*$/;

      router.mount(pathRegex, 'test', callback);
      router.unmount(pathRegex, 'test');

      expect(router.handlers).toHaveLength(0);
    });
  });

  describe('handleRequest()', () => {
    let router;
    let mockRequest;

    beforeEach(() => {
      router = new WebSocketRouter();

      mockRequest = {
        requestedProtocols: ['echo-protocol'],
        resourceURL: {
          pathname: '/test'
        },
        reject: vi.fn()
      };
    });

    it('should route request to matching handler', () => {
      const callback = vi.fn();

      router.mount('/test', 'echo-protocol', callback);
      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].constructor.name).toBe('WebSocketRouterRequest');
    });

    it('should match path correctly', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      router.mount('/test', 'echo-protocol', callback1);
      router.mount('/other', 'echo-protocol', callback2);

      router.handleRequest(mockRequest);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should match protocol correctly', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      router.mount('/test', 'echo-protocol', callback1);
      router.mount('/test', 'chat-protocol', callback2);

      router.handleRequest(mockRequest);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should match wildcard path', () => {
      const callback = vi.fn();

      router.mount('*', 'echo-protocol', callback);
      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
    });

    it('should match wildcard protocol', () => {
      const callback = vi.fn();

      router.mount('/test', '*', callback);
      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle request with no protocol', () => {
      const callback = vi.fn();

      mockRequest.requestedProtocols = [];
      router.mount('/test', null, callback);

      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
    });

    it('should reject with 404 if no handler found', () => {
      router.mount('/other', 'echo-protocol', vi.fn());

      router.handleRequest(mockRequest);

      expect(mockRequest.reject).toHaveBeenCalledWith(404, 'No handler is available for the given request.');
    });

    it('should reject with 404 if path matches but protocol does not', () => {
      router.mount('/test', 'other-protocol', vi.fn());

      router.handleRequest(mockRequest);

      expect(mockRequest.reject).toHaveBeenCalledWith(404, 'No handler is available for the given request.');
    });

    it('should reject with 404 if protocol matches but path does not', () => {
      router.mount('/other', 'echo-protocol', vi.fn());

      router.handleRequest(mockRequest);

      expect(mockRequest.reject).toHaveBeenCalledWith(404, 'No handler is available for the given request.');
    });

    it('should try protocols in order requested', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      mockRequest.requestedProtocols = ['first-protocol', 'second-protocol'];

      router.mount('/test', 'second-protocol', callback2);
      router.mount('/test', 'first-protocol', callback1);

      router.handleRequest(mockRequest);

      // Should call callback1 because first-protocol appears first in requestedProtocols
      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should match RegExp path pattern', () => {
      const callback = vi.fn();

      router.mount(/^\/api\/.*$/, 'echo-protocol', callback);
      mockRequest.resourceURL.pathname = '/api/test';

      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle case-insensitive protocol matching', () => {
      const callback = vi.fn();

      mockRequest.requestedProtocols = ['Echo-Protocol'];
      router.mount('/test', 'echo-protocol', callback);

      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
    });

    it('should pass correct protocol to RouterRequest', () => {
      const callback = vi.fn();

      mockRequest.requestedProtocols = ['proto1', 'proto2'];
      router.mount('/test', 'proto2', callback);

      router.handleRequest(mockRequest);

      expect(callback).toHaveBeenCalled();
      const routerRequest = callback.mock.calls[0][0];
      expect(routerRequest.protocol).toBe('proto2');
    });
  });

  describe('findHandlerIndex()', () => {
    let router;

    beforeEach(() => {
      router = new WebSocketRouter();
    });

    it('should find handler by path and protocol', () => {
      router.mount('/test', 'echo', vi.fn());
      router.mount('/other', 'chat', vi.fn());

      const pathString = router.pathToRegExp('/test').toString();
      const index = router.findHandlerIndex(pathString, 'echo');

      expect(index).toBe(0);
    });

    it('should return -1 if handler not found', () => {
      router.mount('/test', 'echo', vi.fn());

      const pathString = router.pathToRegExp('/nonexistent').toString();
      const index = router.findHandlerIndex(pathString, 'echo');

      expect(index).toBe(-1);
    });

    it('should handle case-insensitive protocol search', () => {
      router.mount('/test', 'Echo-Protocol', vi.fn());

      const pathString = router.pathToRegExp('/test').toString();
      const index = router.findHandlerIndex(pathString, 'echo-protocol');

      expect(index).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pathToRegExp()', () => {
    let router;

    beforeEach(() => {
      router = new WebSocketRouter();
    });

    it('should convert string to RegExp', () => {
      const result = router.pathToRegExp('/test/path');

      expect(result).toBeInstanceOf(RegExp);
      expect(result.test('/test/path')).toBe(true);
      expect(result.test('/other')).toBe(false);
    });

    it('should convert wildcard to match-all RegExp', () => {
      const result = router.pathToRegExp('*');

      expect(result).toBeInstanceOf(RegExp);
      expect(result.test('/any/path')).toBe(true);
      expect(result.test('/')).toBe(true);
      expect(result.test('')).toBe(true);
    });

    it('should pass through RegExp unchanged', () => {
      const regex = /^\/api\/.*$/;
      const result = router.pathToRegExp(regex);

      expect(result).toBe(regex);
    });

    it('should escape special regex characters', () => {
      const result = router.pathToRegExp('/test.path?query=1');

      // Should match the literal string, not regex special meanings
      expect(result.test('/test.path?query=1')).toBe(true);
      expect(result.test('/testXpathYquery=1')).toBe(false);
    });

    it('should create anchored patterns', () => {
      const result = router.pathToRegExp('/test');

      // Should match exactly, not as substring
      expect(result.test('/test')).toBe(true);
      expect(result.test('/test/extra')).toBe(false);
      expect(result.test('/prefix/test')).toBe(false);
    });
  });

  describe('Integration with WebSocketServer', () => {
    let httpServer;
    let wsServer;
    let router;

    beforeEach(() => {
      httpServer = new EventEmitter();
      wsServer = new WebSocketServer({ httpServer });
      router = new WebSocketRouter({ server: wsServer });
    });

    afterEach(() => {
      if (router.server) {
        router.detachServer();
      }
      wsServer.unmount();
    });

    it('should receive requests from WebSocketServer', async () => {
      const callback = vi.fn((routerRequest) => {
        expect(routerRequest.constructor.name).toBe('WebSocketRouterRequest');
      });

      router.mount('/test', 'echo', callback);

      const mockRequest = {
        requestedProtocols: ['echo'],
        resourceURL: { pathname: '/test' },
        reject: vi.fn()
      };

      wsServer.emit('request', mockRequest);

      // Wait for async processing
      await new Promise(resolve => setImmediate(resolve));

      expect(callback).toHaveBeenCalled();
    });

    it('should properly detach when shutting down', () => {
      const listenersBefore = wsServer.listenerCount('request');

      router.detachServer();

      expect(wsServer.listenerCount('request')).toBe(listenersBefore - 1);
    });
  });
});
