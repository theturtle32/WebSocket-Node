import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { createEchoServer } from '../../helpers/test-server.mjs';

describe('Historical Regressions', () => {
  let echoServer;

  beforeEach(async () => {
    echoServer = await createEchoServer();
  });

  afterEach(async () => {
    if (echoServer) {
      await echoServer.stop();
    }
  });

  describe('Issue 195', () => {
    it('should not throw when passing number to connection.send()', async () => {
      return new Promise((resolve, reject) => {
        const client = new WebSocketClient();
        
        client.on('connect', (connection) => {
          expect(() => {
            connection.send(12345);
          }).not.toThrow();
          
          connection.close();
          resolve();
        });
        
        client.on('connectFailed', (errorDescription) => {
          reject(new Error(errorDescription));
        });
        
        client.connect(echoServer.getURL(), null);
      });
    });
  });
});