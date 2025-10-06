/**
 * Enhanced W3CWebSocket Tests
 *
 * Comprehensive tests for W3C WebSocket API compliance including:
 * - Constructor and initialization
 * - ReadyState transitions
 * - W3C readonly properties and constants
 * - send() method with various data types
 * - close() method in different states
 * - binaryType property handling
 * - Binary message conversion (Buffer to ArrayBuffer)
 * - Connection failure scenarios
 * - Error handling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import W3CWebSocket from '../../../lib/W3CWebSocket.js';
import { createEchoServer } from '../../helpers/test-server.mjs';

describe('W3CWebSocket - Enhanced Coverage', () => {
  let echoServer;

  beforeEach(async () => {
    echoServer = await createEchoServer();
  });

  afterEach(async () => {
    if (echoServer) {
      await echoServer.stop();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with CONNECTING state', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
      expect(ws.url).toBe(echoServer.getURL());
      expect(ws.protocol).toBeUndefined();
      expect(ws.extensions).toBe('');
      expect(ws.bufferedAmount).toBe(0);
      expect(ws.binaryType).toBe('arraybuffer');
    });

    it('should accept protocols parameter', () => {
      const ws = new W3CWebSocket(echoServer.getURL(), ['chat', 'superchat']);

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
    });

    it('should accept origin parameter', () => {
      const ws = new W3CWebSocket(
        echoServer.getURL(),
        null,
        'http://localhost'
      );

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
    });

    it('should accept headers parameter', () => {
      const ws = new W3CWebSocket(
        echoServer.getURL(),
        null,
        null,
        { 'X-Custom-Header': 'value' }
      );

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
    });

    it('should successfully establish connection', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          // Connection established successfully
          expect(ws.readyState).toBe(W3CWebSocket.OPEN);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('ReadyState Transitions', () => {
    it('should transition from CONNECTING to OPEN', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);

        ws.addEventListener('open', () => {
          expect(ws.readyState).toBe(W3CWebSocket.OPEN);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should transition from OPEN to CLOSING to CLOSED', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());
        const states = [];

        ws.addEventListener('open', () => {
          states.push(ws.readyState);
          expect(ws.readyState).toBe(W3CWebSocket.OPEN);
          ws.close();
          states.push(ws.readyState);
          expect(ws.readyState).toBe(W3CWebSocket.CLOSING);
        });

        ws.addEventListener('close', () => {
          states.push(ws.readyState);
          expect(ws.readyState).toBe(W3CWebSocket.CLOSED);
          expect(states).toEqual([
            W3CWebSocket.OPEN,
            W3CWebSocket.CLOSING,
            W3CWebSocket.CLOSED
          ]);
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

  });

  describe('W3C Constants', () => {
    it('should expose CONNECTING constant on prototype', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      expect(ws.CONNECTING).toBe(0);
    });

    it('should expose OPEN constant on prototype', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      expect(ws.OPEN).toBe(1);
    });

    it('should expose CLOSING constant on prototype', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      expect(ws.CLOSING).toBe(2);
    });

    it('should expose CLOSED constant on prototype', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      expect(ws.CLOSED).toBe(3);
    });

    it('should expose CONNECTING constant on class', () => {
      expect(W3CWebSocket.CONNECTING).toBe(0);
    });

    it('should expose OPEN constant on class', () => {
      expect(W3CWebSocket.OPEN).toBe(1);
    });

    it('should expose CLOSING constant on class', () => {
      expect(W3CWebSocket.CLOSING).toBe(2);
    });

    it('should expose CLOSED constant on class', () => {
      expect(W3CWebSocket.CLOSED).toBe(3);
    });
  });

  describe('Readonly Properties', () => {
    it('should not allow url property modification', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      const originalUrl = ws.url;

      expect(() => {
        ws.url = 'ws://different:8080/';
      }).toThrow();

      expect(ws.url).toBe(originalUrl);
    });

    it('should not allow readyState property modification', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(() => {
        ws.readyState = 99;
      }).toThrow();

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
    });

    it('should not allow protocol property modification', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          expect(() => {
            ws.protocol = 'custom';
          }).toThrow();

          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should not allow extensions property modification', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(() => {
        ws.extensions = 'permessage-deflate';
      }).toThrow();
    });

    it('should not allow bufferedAmount property modification', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(() => {
        ws.bufferedAmount = 100;
      }).toThrow();

      expect(ws.bufferedAmount).toBe(0);
    });
  });

  describe('binaryType Property', () => {
    it('should default to arraybuffer', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      expect(ws.binaryType).toBe('arraybuffer');
    });

    it('should allow setting to arraybuffer', () => {
      const ws = new W3CWebSocket(echoServer.getURL());
      ws.binaryType = 'arraybuffer';
      expect(ws.binaryType).toBe('arraybuffer');
    });

    it('should throw SyntaxError for blob type', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(() => {
        ws.binaryType = 'blob';
      }).toThrow(SyntaxError);

      expect(ws.binaryType).toBe('arraybuffer');
    });

    it('should throw SyntaxError for invalid type', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(() => {
        ws.binaryType = 'invalid';
      }).toThrow(SyntaxError);

      expect(ws.binaryType).toBe('arraybuffer');
    });
  });

  describe('send() Method', () => {
    it('should throw error when sending in CONNECTING state', () => {
      const ws = new W3CWebSocket(echoServer.getURL());

      expect(ws.readyState).toBe(W3CWebSocket.CONNECTING);
      expect(() => {
        ws.send('test');
      }).toThrow('cannot call send() while not connected');
    });

    it('should send string messages', () => {
      return new Promise((resolve, reject) => {
        const message = 'Hello World';
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(message);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBe(message);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should send Buffer messages', () => {
      return new Promise((resolve, reject) => {
        const buffer = Buffer.from('Binary data');
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(buffer);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          const view = new Uint8Array(event.data);
          const received = Buffer.from(view);
          expect(received.toString()).toBe('Binary data');
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should send ArrayBuffer messages', () => {
      return new Promise((resolve, reject) => {
        const buffer = new ArrayBuffer(5);
        const view = new Uint8Array(buffer);
        view[0] = 72; // H
        view[1] = 101; // e
        view[2] = 108; // l
        view[3] = 108; // l
        view[4] = 111; // o

        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(buffer);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          const receivedView = new Uint8Array(event.data);
          expect(receivedView[0]).toBe(72);
          expect(receivedView[1]).toBe(101);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should send Uint8Array messages', () => {
      return new Promise((resolve, reject) => {
        const view = new Uint8Array([1, 2, 3, 4, 5]);
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(view);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          const receivedView = new Uint8Array(event.data);
          expect(receivedView.length).toBe(5);
          expect(receivedView[0]).toBe(1);
          expect(receivedView[4]).toBe(5);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should handle empty ArrayBuffer', () => {
      return new Promise((resolve, reject) => {
        const buffer = new ArrayBuffer(0);
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(buffer);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          expect(event.data.byteLength).toBe(0);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('close() Method', () => {
    it('should close with default code and reason', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close();
        });

        ws.addEventListener('close', (event) => {
          expect(event.wasClean).toBe(true);
          expect(event.code).toBe(1000);
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should close with custom code', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close(1001);
        });

        ws.addEventListener('close', (event) => {
          expect(event.code).toBe(1001);
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should close with custom code and reason', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close(1000, 'Normal closure');
        });

        ws.addEventListener('close', (event) => {
          expect(event.code).toBe(1000);
          expect(event.reason).toBe('Normal closure');
          expect(event.wasClean).toBe(true);
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should do nothing when closing already CLOSED connection', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close();
        });

        let closeCount = 0;
        ws.addEventListener('close', () => {
          closeCount++;

          // Try to close again
          ws.close();

          // Wait a bit to ensure no second close event
          setTimeout(() => {
            expect(closeCount).toBe(1);
            resolve();
          }, 100);
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should do nothing when closing in CLOSING state', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close();
          expect(ws.readyState).toBe(W3CWebSocket.CLOSING);

          // Try to close again while closing
          ws.close();
          expect(ws.readyState).toBe(W3CWebSocket.CLOSING);
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('Connection Failure Scenarios', () => {
    it('should handle connection to invalid port', () => {
      return new Promise((resolve, reject) => {
        // Try to connect to a port that's definitely not listening
        const ws = new W3CWebSocket('ws://127.0.0.1:59999/');

        let errorReceived = false;

        ws.addEventListener('error', () => {
          errorReceived = true;
        });

        ws.addEventListener('close', (event) => {
          expect(errorReceived).toBe(true);
          expect(ws.readyState).toBe(W3CWebSocket.CLOSED);
          expect(event.code).toBe(1006);
          expect(event.reason).toBe('connection failed');
          expect(event.wasClean).toBe(false);
          resolve();
        });

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('Binary Message Conversion', () => {
    it('should convert Buffer to ArrayBuffer', () => {
      return new Promise((resolve, reject) => {
        const buffer = Buffer.from([1, 2, 3, 4, 5]);
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(buffer);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          expect(event.data.byteLength).toBe(5);

          const view = new Uint8Array(event.data);
          expect(view[0]).toBe(1);
          expect(view[1]).toBe(2);
          expect(view[2]).toBe(3);
          expect(view[3]).toBe(4);
          expect(view[4]).toBe(5);

          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should handle large binary messages', () => {
      return new Promise((resolve, reject) => {
        const size = 1024 * 10; // 10KB
        const buffer = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
          buffer[i] = i % 256;
        }

        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(buffer);
        });

        ws.addEventListener('message', (event) => {
          expect(event.data).toBeInstanceOf(ArrayBuffer);
          expect(event.data.byteLength).toBe(size);

          const view = new Uint8Array(event.data);
          expect(view[0]).toBe(0);
          expect(view[size - 1]).toBe((size - 1) % 256);

          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 10000);
      });
    });
  });

  describe('Event Dispatching', () => {
    it('should dispatch open event', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', (event) => {
          expect(event.type).toBe('open');
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should dispatch message event with data', () => {
      return new Promise((resolve, reject) => {
        const message = 'test message';
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.send(message);
        });

        ws.addEventListener('message', (event) => {
          expect(event.type).toBe('message');
          expect(event.data).toBe(message);
          ws.close();
        });

        ws.addEventListener('close', () => {
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should dispatch close event with code and reason', () => {
      return new Promise((resolve, reject) => {
        const ws = new W3CWebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          ws.close(1000, 'Test closure');
        });

        ws.addEventListener('close', (event) => {
          expect(event.type).toBe('close');
          expect(event.code).toBe(1000);
          expect(event.reason).toBe('Test closure');
          expect(event.wasClean).toBe(true);
          resolve();
        });

        ws.addEventListener('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });
});
