import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { prepare, stopServer, getPort } from '../../helpers/test-server.mjs';

describe('Connection Lifecycle', () => {
  let wsServer;
  let serverPort;

  beforeEach(async () => {
    wsServer = await prepare();
    serverPort = wsServer.getPort();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('should handle TCP connection drop before server accepts request', async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test timed out - client connection was not handled properly'));
      }, 10000);

      let testsCompleted = 0;
      const expectedTests = 5;
      
      function checkCompletion() {
        testsCompleted++;
        if (testsCompleted === expectedTests) {
          clearTimeout(timeout);
          resolve();
        }
      }

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
            clearTimeout(timeout);
            reject(new Error('No error events should be received on the connection'));
          });

        }, 500);
      });

      const client = new WebSocketClient();
      
      client.on('connectFailed', (error) => {
        // This is expected - the client should fail to connect
        expect(true).toBe(true); // Expected connection failure
        checkCompletion();
      });

      client.on('connect', (connection) => {
        clearTimeout(timeout);
        connection.drop();
        reject(new Error('Client should never connect.'));
      });

      client.connect(`ws://localhost:${serverPort}/`, ['test']);

      setTimeout(() => {
        // Bail on the connection before we hear back from the server.
        client.abort();
      }, 250);

    });
  }, 20000); // Increase timeout for this specific test
});