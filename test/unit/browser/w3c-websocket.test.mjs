import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from '../../../lib/W3CWebSocket.js';
import { createEchoServer } from '../../helpers/test-server.mjs';

describe('W3CWebSocket', () => {
  let echoServer;

  beforeEach(async () => {
    echoServer = await createEchoServer();
  });

  afterEach(async () => {
    if (echoServer) {
      await echoServer.stop();
    }
  });

  describe('Event Listeners with ws.onxxxxx', () => {
    it('should call event handlers in correct order', () => {
      return new Promise((resolve, reject) => {
        let counter = 0;
        const message = 'This is a test message.';

        const ws = new WebSocket(echoServer.getURL());

        ws.onopen = () => {
          expect(++counter).toBe(1);
          ws.send(message);
        };
        
        ws.onerror = (event) => {
          reject(new Error(`No errors are expected: ${event.type || JSON.stringify(event)}`));
        };
        
        ws.onmessage = (event) => {
          expect(++counter).toBe(2);
          expect(event.data).toBe(message);
          ws.close();
        };
        
        ws.onclose = (event) => {
          expect(++counter).toBe(3);
          resolve();
        };
      });
    });
  });

  describe('Event Listeners with ws.addEventListener', () => {
    it('should support addEventListener with multiple listeners', () => {
      return new Promise((resolve, reject) => {
        let counter = 0;
        const message = 'This is a test message.';

        const ws = new WebSocket(echoServer.getURL());

        ws.addEventListener('open', () => {
          expect(++counter).toBe(1);
          ws.send(message);
        });
        
        ws.addEventListener('error', (event) => {
          reject(new Error(`No errors are expected: ${event.type || JSON.stringify(event)}`));
        });
        
        ws.addEventListener('message', (event) => {
          expect(++counter).toBe(2);
          expect(event.data).toBe(message);
          ws.close();
        });
        
        ws.addEventListener('close', (event) => {
          expect(++counter).toBe(3);
        });
        
        ws.addEventListener('close', (event) => {
          expect(++counter).toBe(4);
          resolve();
        });
      });
    });
  });
});