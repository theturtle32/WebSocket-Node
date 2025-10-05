/**
 * WebSocketRouterRequest Comprehensive Tests
 *
 * Tests all WebSocketRouterRequest functionality including:
 * - Constructor and property initialization
 * - Protocol handling (including sentinel value)
 * - accept() method and event emission
 * - reject() method and event emission
 * - Delegation to underlying WebSocketRequest
 * - Event emitter inheritance
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WebSocketRouterRequest from '../../../lib/WebSocketRouterRequest.js';

describe('WebSocketRouterRequest - Comprehensive Tests', () => {
  let mockWebSocketRequest;
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      connected: true,
      protocol: 'test-protocol',
      remoteAddress: '127.0.0.1'
    };

    mockWebSocketRequest = {
      origin: 'http://localhost',
      resource: '/test',
      resourceURL: {
        pathname: '/test',
        query: {}
      },
      httpRequest: {
        headers: {
          'host': 'localhost:8080'
        }
      },
      remoteAddress: '127.0.0.1',
      webSocketVersion: 13,
      requestedExtensions: [],
      cookies: [],
      accept: vi.fn().mockReturnValue(mockConnection),
      reject: vi.fn()
    };
  });

  describe('Constructor', () => {
    it('should properly initialize with protocol', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      expect(routerRequest.webSocketRequest).toBe(mockWebSocketRequest);
      expect(routerRequest.protocol).toBe('test-protocol');
      expect(routerRequest.origin).toBe('http://localhost');
      expect(routerRequest.resource).toBe('/test');
      expect(routerRequest.resourceURL).toBe(mockWebSocketRequest.resourceURL);
      expect(routerRequest.httpRequest).toBe(mockWebSocketRequest.httpRequest);
      expect(routerRequest.remoteAddress).toBe('127.0.0.1');
      expect(routerRequest.webSocketVersion).toBe(13);
      expect(routerRequest.requestedExtensions).toEqual([]);
      expect(routerRequest.cookies).toEqual([]);
    });

    it('should handle sentinel protocol value ____no_protocol____', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        '____no_protocol____'
      );

      expect(routerRequest.protocol).toBeNull();
    });

    it('should set protocol to null for ____no_protocol____ sentinel', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        '____no_protocol____'
      );

      expect(routerRequest.protocol).toBeNull();
      expect(routerRequest.webSocketRequest).toBe(mockWebSocketRequest);
    });

    it('should copy all properties from webSocketRequest', () => {
      mockWebSocketRequest.requestedExtensions = [
        { name: 'permessage-deflate', params: [] }
      ];
      mockWebSocketRequest.cookies = [
        { name: 'session', value: 'abc123' }
      ];

      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );

      expect(routerRequest.requestedExtensions).toBe(mockWebSocketRequest.requestedExtensions);
      expect(routerRequest.cookies).toBe(mockWebSocketRequest.cookies);
    });

    it('should inherit from EventEmitter', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );

      expect(routerRequest.on).toBeDefined();
      expect(routerRequest.emit).toBeDefined();
      expect(routerRequest.removeListener).toBeDefined();
      expect(typeof routerRequest.on).toBe('function');
    });

    it('should handle resourceURL with query parameters', () => {
      mockWebSocketRequest.resourceURL = {
        pathname: '/test',
        query: { id: '123', type: 'test' }
      };

      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );

      expect(routerRequest.resourceURL.query.id).toBe('123');
      expect(routerRequest.resourceURL.query.type).toBe('test');
    });
  });

  describe('accept() method', () => {
    it('should delegate to webSocketRequest.accept with protocol', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      routerRequest.accept();

      expect(mockWebSocketRequest.accept).toHaveBeenCalledWith(
        'test-protocol',
        undefined,
        undefined
      );
    });

    it('should pass origin and cookies to webSocketRequest.accept', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const origin = 'http://localhost';
      const cookies = [{ name: 'test', value: 'cookie' }];

      routerRequest.accept(origin, cookies);

      expect(mockWebSocketRequest.accept).toHaveBeenCalledWith(
        'test-protocol',
        origin,
        cookies
      );
    });

    it('should return the connection from webSocketRequest.accept', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const connection = routerRequest.accept();

      expect(connection).toBe(mockConnection);
    });

    it('should emit requestAccepted event with connection', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const acceptedHandler = vi.fn();
      routerRequest.on('requestAccepted', acceptedHandler);

      routerRequest.accept();

      expect(acceptedHandler).toHaveBeenCalledWith(mockConnection);
    });

    it('should emit requestAccepted before returning connection', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      let eventEmitted = false;
      routerRequest.on('requestAccepted', () => {
        eventEmitted = true;
      });

      routerRequest.accept();

      expect(eventEmitted).toBe(true);
    });

    it('should handle accept with null protocol', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        '____no_protocol____'
      );

      routerRequest.accept();

      expect(mockWebSocketRequest.accept).toHaveBeenCalledWith(
        null,
        undefined,
        undefined
      );
    });

    it('should handle multiple event listeners for requestAccepted', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      routerRequest.on('requestAccepted', handler1);
      routerRequest.on('requestAccepted', handler2);

      routerRequest.accept();

      expect(handler1).toHaveBeenCalledWith(mockConnection);
      expect(handler2).toHaveBeenCalledWith(mockConnection);
    });
  });

  describe('reject() method', () => {
    it('should delegate to webSocketRequest.reject with default parameters', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      routerRequest.reject();

      expect(mockWebSocketRequest.reject).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined
      );
    });

    it('should pass status to webSocketRequest.reject', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      routerRequest.reject(404);

      expect(mockWebSocketRequest.reject).toHaveBeenCalledWith(
        404,
        undefined,
        undefined
      );
    });

    it('should pass status and reason to webSocketRequest.reject', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      routerRequest.reject(403, 'Forbidden');

      expect(mockWebSocketRequest.reject).toHaveBeenCalledWith(
        403,
        'Forbidden',
        undefined
      );
    });

    it('should pass all parameters to webSocketRequest.reject', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const extraHeaders = { 'X-Custom': 'value' };
      routerRequest.reject(404, 'Not Found', extraHeaders);

      expect(mockWebSocketRequest.reject).toHaveBeenCalledWith(
        404,
        'Not Found',
        extraHeaders
      );
    });

    it('should emit requestRejected event with routerRequest itself', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const rejectedHandler = vi.fn();
      routerRequest.on('requestRejected', rejectedHandler);

      routerRequest.reject();

      expect(rejectedHandler).toHaveBeenCalledWith(routerRequest);
    });

    it('should emit requestRejected with correct routerRequest reference', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      let emittedRequest = null;
      routerRequest.on('requestRejected', (request) => {
        emittedRequest = request;
      });

      routerRequest.reject();

      expect(emittedRequest).toBe(routerRequest);
    });

    it('should handle multiple event listeners for requestRejected', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      routerRequest.on('requestRejected', handler1);
      routerRequest.on('requestRejected', handler2);

      routerRequest.reject(403);

      expect(handler1).toHaveBeenCalledWith(routerRequest);
      expect(handler2).toHaveBeenCalledWith(routerRequest);
    });
  });

  describe('Event Emitter Behavior', () => {
    it('should support removeListener for requestAccepted', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler = vi.fn();
      routerRequest.on('requestAccepted', handler);
      routerRequest.removeListener('requestAccepted', handler);

      routerRequest.accept();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support removeListener for requestRejected', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler = vi.fn();
      routerRequest.on('requestRejected', handler);
      routerRequest.removeListener('requestRejected', handler);

      routerRequest.reject();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support once() for requestAccepted event', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler = vi.fn();
      routerRequest.once('requestAccepted', handler);

      // First accept should trigger handler
      routerRequest.accept();
      expect(handler).toHaveBeenCalledTimes(1);

      // Mock needs to be reset to allow multiple calls
      mockWebSocketRequest.accept.mockClear();
      mockWebSocketRequest.accept.mockReturnValue(mockConnection);

      // Second accept should not trigger handler again
      routerRequest.accept();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support custom events via EventEmitter', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'test-protocol'
      );

      const handler = vi.fn();
      routerRequest.on('customEvent', handler);

      routerRequest.emit('customEvent', 'test-data');

      expect(handler).toHaveBeenCalledWith('test-data');
    });
  });

  describe('Edge Cases', () => {
    it('should handle webSocketRequest with minimal properties', () => {
      const minimalRequest = {
        origin: 'http://example.com',
        resource: '/',
        resourceURL: { pathname: '/', query: {} },
        httpRequest: { headers: {} },
        remoteAddress: '0.0.0.0',
        webSocketVersion: 13,
        requestedExtensions: [],
        cookies: [],
        accept: vi.fn(),
        reject: vi.fn()
      };

      const routerRequest = new WebSocketRouterRequest(
        minimalRequest,
        'protocol'
      );

      expect(routerRequest.origin).toBe('http://example.com');
      expect(routerRequest.resource).toBe('/');
      expect(routerRequest.remoteAddress).toBe('0.0.0.0');
    });

    it('should handle empty protocol string', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        ''
      );

      expect(routerRequest.protocol).toBe('');
    });

    it('should maintain reference to original webSocketRequest', () => {
      const routerRequest = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );

      expect(routerRequest.webSocketRequest).toBe(mockWebSocketRequest);

      // Modifications to original should be visible
      mockWebSocketRequest.testProperty = 'test-value';
      expect(routerRequest.webSocketRequest.testProperty).toBe('test-value');
    });

    it('should handle accept and reject calls in sequence', () => {
      const routerRequest1 = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );
      const routerRequest2 = new WebSocketRouterRequest(
        mockWebSocketRequest,
        'protocol'
      );

      routerRequest1.accept();
      expect(mockWebSocketRequest.accept).toHaveBeenCalledTimes(1);

      routerRequest2.reject();
      expect(mockWebSocketRequest.reject).toHaveBeenCalledTimes(1);
    });
  });
});
