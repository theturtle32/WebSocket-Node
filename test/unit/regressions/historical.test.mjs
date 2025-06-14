import { describe, it, expect } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import startEchoServer from '../../helpers/start-echo-server.mjs';

describe('Historical Regressions', () => {
  describe('Issue 195', () => {
    it('should not throw when passing number to connection.send()', async () => {
      return new Promise((resolve, reject) => {
        startEchoServer((err, echoServer) => {
          if (err) {
            return reject(new Error('Unable to start echo server: ' + err));
          }
          
          const client = new WebSocketClient();
          
          client.on('connect', (connection) => {
            expect(() => {
              connection.send(12345);
            }).not.toThrow();
            
            connection.close();
            echoServer.kill();
            resolve();
          });
          
          client.on('connectFailed', (errorDescription) => {
            echoServer.kill();
            reject(new Error(errorDescription));
          });
          
          client.connect('ws://localhost:8080', null);
        });
      });
    });
  });
});