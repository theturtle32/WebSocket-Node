/**
 * WebSocketRequest Cookie and Origin Tests
 *
 * Comprehensive tests for cookie setting and origin handling
 * to achieve 85%+ coverage of WebSocketRequest
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocketRequest from '../../../lib/WebSocketRequest.js';
import { MockSocket } from '../../helpers/mocks.mjs';

describe('WebSocketRequest - Cookie and Origin Coverage', () => {
  let mockSocket;
  let mockHttpRequest;
  let request;
  let serverConfig;

  beforeEach(() => {
    mockSocket = new MockSocket();
    mockSocket.remoteAddress = '127.0.0.1';
    mockSocket.write = vi.fn((data) => {
      mockSocket.writtenData.push(data);
      return true;
    });

    mockHttpRequest = {
      url: '/',
      headers: {
        'host': 'localhost',
        'upgrade': 'websocket',
        'connection': 'Upgrade',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='
      }
    };

    serverConfig = {
      maxReceivedFrameSize: 0x10000,
      maxReceivedMessageSize: 0x100000,
      fragmentOutgoingMessages: true,
      fragmentationThreshold: 0x4000,
      keepalive: true,
      keepaliveInterval: 20000,
      dropConnectionOnKeepaliveTimeout: true,
      keepaliveGracePeriod: 10000,
      assembleFragments: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false
    };

    request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
    request.readHandshake();
  });

  afterEach(() => {
    if (mockSocket) {
      mockSocket.removeAllListeners();
    }
  });

  describe('Cookie Setting - Error Cases', () => {
    it('should throw error when cookies is not an array', () => {
      expect(() => {
        request.accept(null, null, 'not-an-array');
      }).toThrow('Value supplied for "cookies" argument must be an array.');
    });

    it('should throw error when cookies is an object', () => {
      expect(() => {
        request.accept(null, null, { name: 'test', value: 'value' });
      }).toThrow('Value supplied for "cookies" argument must be an array.');
    });

    it('should throw error when cookie missing name', () => {
      expect(() => {
        request.accept(null, null, [{ value: 'test' }]);
      }).toThrow('Each cookie to set must at least provide a "name" and "value"');
    });

    it('should throw error when cookie missing value', () => {
      expect(() => {
        request.accept(null, null, [{ name: 'test' }]);
      }).toThrow('Each cookie to set must at least provide a "name" and "value"');
    });

    it('should throw error when cookie name and value both missing', () => {
      expect(() => {
        request.accept(null, null, [{}]);
      }).toThrow('Each cookie to set must at least provide a "name" and "value"');
    });

    it('should throw error for duplicate cookie names', () => {
      expect(() => {
        request.accept(null, null, [
          { name: 'session', value: 'value1' },
          { name: 'session', value: 'value2' }
        ]);
      }).toThrow('You may not specify the same cookie name twice.');
    });

    it('should sanitize cookie name with space', () => {
      // Spaces are sanitized (removed), not rejected
      request.accept(null, null, [{ name: 'my cookie', value: 'test' }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: mycookie=test');
    });

    it('should sanitize cookie name with semicolon', () => {
      // Semicolons are sanitized (removed), not rejected
      request.accept(null, null, [{ name: 'test;bad', value: 'test' }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: testbad=test');
    });

    it('should sanitize cookie name with control character', () => {
      // Control characters are sanitized (removed), not rejected
      request.accept(null, null, [{ name: 'test\x00bad', value: 'test' }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: testbad=test');
    });

    it('should sanitize cookie value with control character', () => {
      // Control characters are sanitized (removed), not rejected
      request.accept(null, null, [{ name: 'test', value: 'value\x00bad' }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=valuebad');
    });

    it('should throw error for cookie value with invalid character (comma)', () => {
      // Comma is NOT sanitized but IS invalid per RFC 6265
      expect(() => {
        request.accept(null, null, [{ name: 'test', value: 'value,bad' }]);
      }).toThrow(/Illegal character.* in cookie value/);
    });

    it('should throw error for cookie name with invalid separator', () => {
      // Test a character that is NOT sanitized but IS invalid (e.g., comma)
      expect(() => {
        request.accept(null, null, [{ name: 'test,bad', value: 'test' }]);
      }).toThrow(/Illegal character.* in cookie name/);
    });
  });

  describe('Cookie Path Validation', () => {
    it('should throw error for cookie path with control character', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          path: '/test\x00bad'
        }]);
      }).toThrow(/Illegal character.* in cookie path/);
    });

    it('should throw error for cookie path with semicolon', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          path: '/test;bad'
        }]);
      }).toThrow(/Illegal character.* in cookie path/);
    });

    it('should accept cookie with valid path', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        path: '/api/v1'
      }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;Path=/api/v1');
    });
  });

  describe('Cookie Domain Validation', () => {
    it('should throw error when domain is not a string', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          domain: 123
        }]);
      }).toThrow('Domain must be specified and must be a string.');
    });

    it('should throw error for cookie domain with control character', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          domain: 'example\x00.com'
        }]);
      }).toThrow(/Illegal character.* in cookie domain/);
    });

    it('should throw error for cookie domain with semicolon', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          domain: 'example;.com'
        }]);
      }).toThrow(/Illegal character.* in cookie domain/);
    });

    it('should accept cookie with valid domain', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        domain: 'Example.COM'
      }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;Domain=example.com');
    });

    it('should lowercase domain value', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        domain: 'EXAMPLE.COM'
      }]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Domain=example.com');
    });
  });

  describe('Cookie Expires Validation', () => {
    it('should throw error when expires is not a Date object', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          expires: 'not-a-date'
        }]);
      }).toThrow('Value supplied for cookie "expires" must be a valid date object');
    });

    it('should throw error when expires is a number', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          expires: Date.now()
        }]);
      }).toThrow('Value supplied for cookie "expires" must be a valid date object');
    });

    it('should accept cookie with valid expires Date', () => {
      const expiresDate = new Date('2025-12-31T23:59:59Z');
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        expires: expiresDate
      }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;Expires=');
      expect(response).toContain(expiresDate.toGMTString());
    });
  });

  describe('Cookie MaxAge Validation', () => {
    it('should throw error when maxage is NaN', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          maxage: 'not-a-number'
        }]);
      }).toThrow('Value supplied for cookie "maxage" must be a non-zero number');
    });

    it('should silently ignore maxage when it is zero', () => {
      // Note: 0 is falsy, so the validation block is skipped entirely
      // This is a known limitation - maxage:0 is silently ignored
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        maxage: 0
      }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value');
      expect(response).not.toContain('Max-Age');
    });

    it('should throw error when maxage is negative', () => {
      expect(() => {
        request.accept(null, null, [{
          name: 'test',
          value: 'value',
          maxage: -100
        }]);
      }).toThrow('Value supplied for cookie "maxage" must be a non-zero number');
    });

    it('should accept cookie with valid numeric maxage', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        maxage: 3600
      }]);

      expect(mockSocket.write).toHaveBeenCalled();
      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;Max-Age=3600');
    });

    it('should accept cookie with string maxage and parse it', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        maxage: '7200'
      }]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Max-Age=7200');
    });
  });

  describe('Cookie Secure and HttpOnly Flags', () => {
    it('should include Secure flag when cookie.secure is true', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        secure: true
      }]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;Secure');
    });

    it('should include HttpOnly flag when cookie.httponly is true', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        httponly: true
      }]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: test=value;HttpOnly');
    });

    it('should include both Secure and HttpOnly when both are true', () => {
      request.accept(null, null, [{
        name: 'test',
        value: 'value',
        secure: true,
        httponly: true
      }]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Secure');
      expect(response).toContain('HttpOnly');
    });
  });

  describe('Multiple Cookies', () => {
    it('should set multiple valid cookies', () => {
      request.accept(null, null, [
        { name: 'session', value: 'abc123' },
        { name: 'user', value: 'john' },
        { name: 'preference', value: 'dark' }
      ]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Set-Cookie: session=abc123');
      expect(response).toContain('Set-Cookie: user=john');
      expect(response).toContain('Set-Cookie: preference=dark');
    });

    it('should set cookies with mixed attributes', () => {
      const expires = new Date('2025-12-31');
      request.accept(null, null, [
        { name: 'session', value: 'abc123', secure: true, httponly: true },
        { name: 'tracking', value: 'xyz789', maxage: 86400, path: '/api' },
        { name: 'preference', value: 'light', domain: 'example.com', expires }
      ]);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('session=abc123');
      expect(response).toContain('Secure');
      expect(response).toContain('HttpOnly');
      expect(response).toContain('tracking=xyz789');
      expect(response).toContain('Max-Age=86400');
      expect(response).toContain('Path=/api');
      expect(response).toContain('preference=light');
      expect(response).toContain('Domain=example.com');
      expect(response).toContain('Expires=');
    });
  });

  describe('Origin Header for Different WebSocket Versions', () => {
    it('should include Origin header for WebSocket version 13', () => {
      request.accept(null, 'https://example.com', null);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Origin: https://example.com');
      expect(response).not.toContain('Sec-WebSocket-Origin');
    });

    it('should include Sec-WebSocket-Origin header for WebSocket version 8', () => {
      // Create fresh mock socket with write spy
      const v8Socket = new MockSocket();
      v8Socket.remoteAddress = '127.0.0.1';
      v8Socket.write = vi.fn((data) => {
        v8Socket.writtenData.push(data);
        return true;
      });

      // Create request with version 8
      const v8HttpRequest = {
        url: '/',
        headers: {
          'host': 'localhost',
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-version': '8',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='
        }
      };

      const v8Request = new WebSocketRequest(v8Socket, v8HttpRequest, {
        maxReceivedFrameSize: 0x10000,
        maxReceivedMessageSize: 0x100000
      });
      v8Request.readHandshake();

      v8Request.accept(null, 'https://example.com', null);

      const response = v8Socket.write.mock.calls[0][0];
      expect(response).toContain('Sec-WebSocket-Origin: https://example.com');
      // Ensure it's not the v13 Origin header (be specific about the header line)
      expect(response).not.toMatch(/\r\nOrigin: https:\/\/example\.com\r\n/);

      v8Socket.removeAllListeners();
    });

    it('should sanitize origin by removing CRLF', () => {
      request.accept(null, 'https://example.com\r\nX-Injected: header', null);

      const response = mockSocket.write.mock.calls[0][0];
      expect(response).toContain('Origin: https://example.comX-Injected: header');
      expect(response).not.toContain('\r\nX-Injected: header\r\n');
    });
  });

  describe('Protocol Validation', () => {
    it('should reject protocol with control character', () => {
      // Add requested protocol to headers
      mockHttpRequest.headers['sec-websocket-protocol'] = 'proto\x00col';
      request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(() => {
        request.accept('proto\x00col', null, null);
      }).toThrow(/Illegal character.* in subprotocol/);
    });

    it('should reject protocol with space', () => {
      // Add requested protocol to headers
      mockHttpRequest.headers['sec-websocket-protocol'] = 'my protocol';
      request = new WebSocketRequest(mockSocket, mockHttpRequest, serverConfig);
      request.readHandshake();

      expect(() => {
        request.accept('my protocol', null, null);
      }).toThrow(/Illegal character.* in subprotocol/);
    });

    it.each(['(', ')', '<', '>', '@', ',', ';', ':', '\\', '"', '/', '[', ']', '?', '=', '{', '}'])('should reject protocol with separator character: %s', (sep) => {
      const newSocket = new MockSocket();
      newSocket.remoteAddress = '127.0.0.1';

      const newHttpRequest = {
        url: '/',
        headers: {
          'host': 'localhost',
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-version': '13',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-protocol': `test${sep}protocol`
        }
      };

      const newRequest = new WebSocketRequest(newSocket, newHttpRequest, { maxReceivedFrameSize: 0x10000 });
      newRequest.readHandshake();

      expect(() => {
        newRequest.accept(`test${sep}protocol`, null, null);
      }).toThrow(/Illegal character.* in subprotocol/);

      newSocket.removeAllListeners();
    });

    it('should accept valid protocol and format correctly', () => {
      // Create fresh mock socket with write spy
      const protocolSocket = new MockSocket();
      protocolSocket.remoteAddress = '127.0.0.1';
      protocolSocket.write = vi.fn((data) => {
        protocolSocket.writtenData.push(data);
        return true;
      });

      // Add requested protocol
      const protocolHttpRequest = {
        url: '/',
        headers: {
          'host': 'localhost',
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-version': '13',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-protocol': 'chat'
        }
      };

      const protocolRequest = new WebSocketRequest(protocolSocket, protocolHttpRequest, {
        maxReceivedFrameSize: 0x10000
      });
      protocolRequest.readHandshake();

      protocolRequest.accept('chat', null, null);

      const response = protocolSocket.write.mock.calls[0][0];
      expect(response).toContain('Sec-WebSocket-Protocol: chat');

      protocolSocket.removeAllListeners();
    });
  });
});
