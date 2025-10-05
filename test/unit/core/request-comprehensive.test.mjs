/**
 * Comprehensive WebSocketRequest Tests
 *
 * Tests all major WebSocketRequest functionality including:
 * - Request parsing and validation
 * - Protocol negotiation
 * - Origin handling
 * - Cookie parsing and validation
 * - Extension parsing
 * - Accept/reject workflows
 * - Error scenarios
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocketRequest from '../../../lib/WebSocketRequest.js';
import { MockSocket } from '../../helpers/mocks.mjs';

describe('WebSocketRequest - Comprehensive Tests', () => {
  let mockSocket;
  let mockHttpRequest;
  let serverConfig;

  beforeEach(() => {
    mockSocket = new MockSocket();
    mockSocket.remoteAddress = '127.0.0.1';

    serverConfig = {
      maxReceivedFrameSize: 0x10000,
      maxReceivedMessageSize: 0x100000,
      fragmentOutgoingMessages: true,
      fragmentationThreshold: 0x4000,
      keepalive: true,
      keepaliveInterval: 20000,
      dropConnectionOnKeepaliveTimeout: true,
      keepaliveGracePeriod: 10000,
      useNativeKeepalive: false,
      assembleFragments: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false,
      parseCookies: true,
      parseExtensions: true,
      disableNagleAlgorithm: true,
      closeTimeout: 5000
    };

    mockHttpRequest = {
      url: '/test',
      headers: {
        'host': 'localhost:8080',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        'origin': 'http://localhost',
        'sec-websocket-protocol': 'chat, superchat',
        'upgrade': 'websocket',
        'connection': 'Upgrade'
      }
    };
  });

  afterEach(() => {
    if (mockSocket) {
      mockSocket.removeAllListeners();
    }
  });

  describe('Request Parsing and Validation', () => {
    it('should parse basic request with all required headers', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.host).toBe('localhost:8080');
      expect(request.key).toBe('dGhlIHNhbXBsZSBub25jZQ==');
      expect(request.webSocketVersion).toBe(13);
      expect(request.origin).toBe('http://localhost');
      expect(request.resource).toBe('/test');
      expect(request.remoteAddress).toBe('127.0.0.1');
    });

    it('should throw error when Host header is missing', () => {
      delete mockHttpRequest.headers['host'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);

      expect(() => request.readHandshake()).toThrow('Client must provide a Host header.');
    });

    it('should throw error when Sec-WebSocket-Key is missing', () => {
      delete mockHttpRequest.headers['sec-websocket-key'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);

      expect(() => request.readHandshake()).toThrow('Client must provide a value for Sec-WebSocket-Key.');
    });

    it('should throw error when Sec-WebSocket-Version is missing', () => {
      delete mockHttpRequest.headers['sec-websocket-version'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);

      expect(() => request.readHandshake()).toThrow('Client must provide a value for Sec-WebSocket-Version.');
    });

    it('should throw error for unsupported WebSocket version', () => {
      mockHttpRequest.headers['sec-websocket-version'] = '7';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);

      expect(() => request.readHandshake()).toThrow('Unsupported websocket client version');
    });

    it('should support WebSocket version 8', () => {
      mockHttpRequest.headers['sec-websocket-version'] = '8';
      mockHttpRequest.headers['sec-websocket-origin'] = 'http://localhost';
      delete mockHttpRequest.headers['origin'];

      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.webSocketVersion).toBe(8);
      expect(request.origin).toBe('http://localhost');
    });

    it('should support WebSocket version 13', () => {
      mockHttpRequest.headers['sec-websocket-version'] = '13';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.webSocketVersion).toBe(13);
    });

    it('should parse resource URL with query parameters', () => {
      mockHttpRequest.url = '/test?param1=value1&param2=value2';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.resourceURL.pathname).toBe('/test');
      expect(request.resourceURL.query.param1).toBe('value1');
      expect(request.resourceURL.query.param2).toBe('value2');
    });
  });

  describe('Protocol Negotiation', () => {
    it('should parse single requested protocol', () => {
      mockHttpRequest.headers['sec-websocket-protocol'] = 'chat';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedProtocols).toEqual(['chat']);
    });

    it('should parse multiple requested protocols', () => {
      mockHttpRequest.headers['sec-websocket-protocol'] = 'chat, superchat, ultrachat';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedProtocols).toEqual(['chat', 'superchat', 'ultrachat']);
    });

    it('should handle missing protocol header', () => {
      delete mockHttpRequest.headers['sec-websocket-protocol'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedProtocols).toEqual([]);
    });

    it('should normalize protocols to lowercase', () => {
      mockHttpRequest.headers['sec-websocket-protocol'] = 'Chat, SuperChat';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedProtocols).toEqual(['chat', 'superchat']);
      expect(request.protocolFullCaseMap['chat']).toBe('Chat');
      expect(request.protocolFullCaseMap['superchat']).toBe('SuperChat');
    });

    it('should reject protocol with spaces', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn();

      expect(() => request.accept('invalid protocol')).toThrow('Illegal character');
    });

    it('should reject protocol not requested by client', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn();

      expect(() => request.accept('unrequested')).toThrow('Specified protocol was not requested by the client');
    });
  });

  describe('X-Forwarded-For Handling', () => {
    it('should parse X-Forwarded-For header', () => {
      mockHttpRequest.headers['x-forwarded-for'] = '203.0.113.1, 198.51.100.1';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.remoteAddresses).toEqual(['203.0.113.1', '198.51.100.1', '127.0.0.1']);
      expect(request.remoteAddress).toBe('203.0.113.1');
    });

    it('should ignore X-Forwarded-For when ignoreXForwardedFor is true', () => {
      serverConfig.ignoreXForwardedFor = true;
      mockHttpRequest.headers['x-forwarded-for'] = '203.0.113.1';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.remoteAddresses).toEqual(['127.0.0.1']);
      expect(request.remoteAddress).toBe('127.0.0.1');
    });
  });

  describe('Extension Parsing', () => {
    it('should parse single extension without parameters', () => {
      mockHttpRequest.headers['sec-websocket-extensions'] = 'permessage-deflate';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedExtensions).toHaveLength(1);
      expect(request.requestedExtensions[0].name).toBe('permessage-deflate');
      expect(request.requestedExtensions[0].params).toEqual([]);
    });

    it('should parse extension with parameters', () => {
      mockHttpRequest.headers['sec-websocket-extensions'] = 'permessage-deflate; client_max_window_bits';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedExtensions).toHaveLength(1);
      expect(request.requestedExtensions[0].name).toBe('permessage-deflate');
      expect(request.requestedExtensions[0].params).toHaveLength(1);
      expect(request.requestedExtensions[0].params[0].name).toBe('client_max_window_bits');
    });

    it('should parse multiple extensions', () => {
      mockHttpRequest.headers['sec-websocket-extensions'] = 'permessage-deflate, permessage-bzip2';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedExtensions).toHaveLength(2);
      expect(request.requestedExtensions[0].name).toBe('permessage-deflate');
      expect(request.requestedExtensions[1].name).toBe('permessage-bzip2');
    });

    it('should handle missing extensions header', () => {
      delete mockHttpRequest.headers['sec-websocket-extensions'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedExtensions).toEqual([]);
    });

    it('should skip extension parsing when parseExtensions is false', () => {
      serverConfig.parseExtensions = false;
      mockHttpRequest.headers['sec-websocket-extensions'] = 'permessage-deflate';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.requestedExtensions).toEqual([]);
    });
  });

  describe('Cookie Parsing', () => {
    it('should parse single cookie', () => {
      mockHttpRequest.headers['cookie'] = 'session=abc123';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies).toHaveLength(1);
      expect(request.cookies[0].name).toBe('session');
      expect(request.cookies[0].value).toBe('abc123');
    });

    it('should parse multiple cookies', () => {
      mockHttpRequest.headers['cookie'] = 'session=abc123; user=john';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies).toHaveLength(2);
      expect(request.cookies[0].name).toBe('session');
      expect(request.cookies[0].value).toBe('abc123');
      expect(request.cookies[1].name).toBe('user');
      expect(request.cookies[1].value).toBe('john');
    });

    it('should handle cookie without value', () => {
      mockHttpRequest.headers['cookie'] = 'session';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies).toHaveLength(1);
      expect(request.cookies[0].name).toBe('session');
      expect(request.cookies[0].value).toBeNull();
    });

    it('should decode URL-encoded cookie values', () => {
      mockHttpRequest.headers['cookie'] = 'data=hello%20world';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies[0].value).toBe('hello world');
    });

    it('should handle quoted cookie values', () => {
      mockHttpRequest.headers['cookie'] = 'session="abc123"';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies[0].value).toBe('abc123');
    });

    it('should handle missing cookie header', () => {
      delete mockHttpRequest.headers['cookie'];
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies).toEqual([]);
    });

    it('should skip cookie parsing when parseCookies is false', () => {
      serverConfig.parseCookies = false;
      mockHttpRequest.headers['cookie'] = 'session=abc123';
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(request.cookies).toEqual([]);
    });
  });

  describe('Accept Workflow', () => {
    it('should generate valid accept response', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.write = vi.fn((data) => {
        writtenData += data;
        return true;
      });

      const connection = request.accept();

      expect(writtenData).toContain('HTTP/1.1 101 Switching Protocols');
      expect(writtenData).toContain('Upgrade: websocket');
      expect(writtenData).toContain('Connection: Upgrade');
      expect(writtenData).toContain('Sec-WebSocket-Accept:');
      expect(connection).toBeDefined();
    });

    it('should include protocol in accept response when specified', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.write = vi.fn((data) => {
        writtenData += data;
        return true;
      });

      request.accept('chat');

      expect(writtenData).toContain('Sec-WebSocket-Protocol: chat');
    });

    it('should include origin in accept response when specified', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.write = vi.fn((data) => {
        writtenData += data;
        return true;
      });

      request.accept(null, 'http://localhost');

      expect(writtenData).toContain('Origin: http://localhost');
    });

    it('should throw error when accepting twice', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn(() => true);

      request.accept();
      expect(() => request.accept()).toThrow('WebSocketRequest may only be accepted or rejected one time');
    });

    it('should throw error when accepting after reject', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn(() => true);

      request.reject();
      expect(() => request.accept()).toThrow('WebSocketRequest may only be accepted or rejected one time');
    });
  });

  describe('Reject Workflow', () => {
    it('should generate valid reject response with default status', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.end = vi.fn((data) => {
        writtenData += data;
      });

      request.reject();

      expect(writtenData).toContain('HTTP/1.1 403 Forbidden');
      expect(mockSocket.end).toHaveBeenCalled();
    });

    it('should reject with custom status code', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.end = vi.fn((data) => {
        writtenData += data;
      });

      request.reject(404);

      expect(writtenData).toContain('HTTP/1.1 404 Not Found');
    });

    it('should reject with custom reason', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      let writtenData = '';
      mockSocket.end = vi.fn((data) => {
        writtenData += data;
      });

      request.reject(403, 'Custom reason');

      expect(writtenData).toContain('Custom reason');
    });

    it('should throw error when rejecting twice', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn(() => true);
      mockSocket.end = vi.fn();

      request.reject();
      expect(() => request.reject()).toThrow('WebSocketRequest may only be accepted or rejected one time');
    });

    it('should throw error when rejecting after accept', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.write = vi.fn(() => true);

      request.accept();
      expect(() => request.reject()).toThrow('WebSocketRequest may only be accepted or rejected one time');
    });
  });

  describe('Socket Close Before Accept/Reject', () => {
    it('should handle socket close before accept', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.emit('close');

      expect(request._socketIsClosing).toBe(true);
    });

    it('should handle socket end before accept', () => {
      const request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      mockSocket.emit('end');

      expect(request._socketIsClosing).toBe(true);
    });
  });
});
