import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { prepare, stopServer, getPort } from '../../helpers/test-server.mjs';

describe('Connection Lifecycle', () => {
  let wsServer;

  beforeEach(async () => {
    wsServer = await prepare();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('should handle TCP connection drop before server accepts request', async () => {
    return new Promise((resolve, reject) => {
      let testsCompleted = 0;
      const expectedTests = 5;
      
      function checkCompletion() {
        testsCompleted++;
        if (testsCompleted === expectedTests) {
          resolve();
        }
      }

      wsServer.on('connect', (connection) => {
        expect(true).toBe(true); // Server should emit connect event
        checkCompletion();
      });

      wsServer.on('request', (request) => {
        expect(true).toBe(true); // Request received
        checkCompletion();

        // Wait 500 ms before accepting connection
        setTimeout(() => {
          const connection = request.accept(request.requestedProtocols[0], request.origin);

          connection.on('close', (reasonCode, description) => {
            expect(true).toBe(true); // Connection should emit close event
            checkCompletion();
            
            expect(reasonCode).toBe(1006);
            checkCompletion();
            
            expect(description).toBe('TCP connection lost before handshake completed.');
            checkCompletion();
          });

          connection.on('error', (error) => {
            reject(new Error('No error events should be received on the connection'));
          });

        }, 500);
      });

      const client = new WebSocketClient();
      client.on('connect', (connection) => {
        connection.drop();
        reject(new Error('Client should never connect.'));
      });

      client.connect(`ws://localhost:${getPort()}/`, ['test']);

      setTimeout(() => {
        // Bail on the connection before we hear back from the server.
        client.abort();
      }, 250);

    });
  });
});