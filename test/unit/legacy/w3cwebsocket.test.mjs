import { describe, it, expect } from 'vitest';
import WebSocket from '../../../lib/W3CWebSocket.js';
import startEchoServer from '../../shared/start-echo-server.js';

describe('W3CWebSockets adding event listeners with ws.onxxxxx', () => {
  it('should call event handlers in correct order', async () => {
    let counter = 0;
    const message = 'This is a test message.';

    await new Promise((resolve) => {
      startEchoServer((err, echoServer) => {
        if (err) {
          throw new Error('Unable to start echo server: ' + err);
        }

        const ws = new WebSocket('ws://localhost:8080/');

        ws.onopen = () => {
          expect(++counter).toBe(1); // onopen should be called first
          ws.send(message);
        };

        ws.onerror = (event) => {
          throw new Error('No errors are expected: ' + event);
        };

        ws.onmessage = (event) => {
          expect(++counter).toBe(2); // onmessage should be called second
          expect(event.data).toBe(message); // Received message data should match sent message data
          ws.close();
        };

        ws.onclose = () => {
          expect(++counter).toBe(3); // onclose should be called last
          echoServer.kill();
          resolve();
        };
      });
    });
  });
});

describe('W3CWebSockets adding event listeners with ws.addEventListener', () => {
  it('should fire events in correct order with multiple listeners', async () => {
    let counter = 0;
    const message = 'This is a test message.';

    await new Promise((resolve) => {
      startEchoServer((err, echoServer) => {
        if (err) {
          throw new Error('Unable to start echo server: ' + err);
        }

        const ws = new WebSocket('ws://localhost:8080/');

        ws.addEventListener('open', () => {
          expect(++counter).toBe(1); // "open" should be fired first
          ws.send(message);
        });

        ws.addEventListener('error', (event) => {
          throw new Error('No errors are expected: ' + event);
        });

        ws.addEventListener('message', (event) => {
          expect(++counter).toBe(2); // "message" should be fired second
          expect(event.data).toBe(message); // Received message data should match sent message data
          ws.close();
        });

        ws.addEventListener('close', () => {
          expect(++counter).toBe(3); // "close" should be fired
        });

        ws.addEventListener('close', () => {
          expect(++counter).toBe(4); // "close" should be fired one more time
          echoServer.kill();
          resolve();
        });
      });
    });
  });
});
