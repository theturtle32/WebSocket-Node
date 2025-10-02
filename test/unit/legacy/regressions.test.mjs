import { describe, it, expect } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import startEchoServer from '../../shared/start-echo-server.js';

describe('Issue 195 - passing number to connection.send() shouldn\'t throw', () => {
  it('should not throw when sending a number', async () => {
    await new Promise((resolve) => {
      startEchoServer((err, echoServer) => {
        if (err) {
          throw new Error('Unable to start echo server: ' + err);
        }

        const client = new WebSocketClient();
        client.on('connect', (connection) => {
          // Should not throw
          expect(() => {
            connection.send(12345);
          }).not.toThrow();

          connection.close();
          echoServer.kill();
          resolve();
        });

        client.on('connectFailed', (errorDescription) => {
          echoServer.kill();
          throw new Error(errorDescription);
        });

        client.connect('ws://localhost:8080', null);
      });
    });
  });
});
