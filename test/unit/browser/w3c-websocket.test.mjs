import { describe, it, expect } from 'vitest';
import WebSocket from '../../../lib/W3CWebSocket.js';
import startEchoServer from '../../helpers/start-echo-server.mjs';

describe('W3CWebSocket', () => {
  describe('Event Listeners with ws.onxxxxx', () => {
    it('should call event handlers in correct order', async () => {
      return new Promise((resolve, reject) => {
        let counter = 0;
        const message = 'This is a test message.';

        startEchoServer((err, echoServer) => {
          if (err) {
            return reject(new Error('Unable to start echo server: ' + err));
          }

          const ws = new WebSocket('ws://localhost:8080/');

          ws.onopen = () => {
            expect(++counter).toBe(1);
            ws.send(message);
          };
          
          ws.onerror = (event) => {
            echoServer.kill();
            reject(new Error('No errors are expected: ' + event));
          };
          
          ws.onmessage = (event) => {
            expect(++counter).toBe(2);
            expect(event.data).toBe(message);
            ws.close();
          };
          
          ws.onclose = (event) => {
            expect(++counter).toBe(3);
            echoServer.kill();
            resolve();
          };
        });
      });
    });
  });

  describe('Event Listeners with ws.addEventListener', () => {
    it('should support addEventListener with multiple listeners', async () => {
      return new Promise((resolve, reject) => {
        let counter = 0;
        const message = 'This is a test message.';

        startEchoServer((err, echoServer) => {
          if (err) {
            return reject(new Error('Unable to start echo server: ' + err));
          }

          const ws = new WebSocket('ws://localhost:8080/');

          ws.addEventListener('open', () => {
            expect(++counter).toBe(1);
            ws.send(message);
          });
          
          ws.addEventListener('error', (event) => {
            echoServer.kill();
            reject(new Error('No errors are expected: ' + event));
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
            echoServer.kill();
            resolve();
          });
        });
      });
    });
  });
});