import { describe, it, expect } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import server from '../../shared/test-server.js';

const stopServer = server.stopServer;

describe('Drop TCP Connection Before server accepts the request', () => {
  it('should handle connection drop before handshake completion', async () => {
    const results = {
      requestReceived: false,
      serverConnectEmitted: false,
      connectionCloseEmitted: false,
      closeReasonCode: null,
      closeDescription: null
    };

    await new Promise((resolve) => {
      server.prepare((err, wsServer) => {
        if (err) {
          throw new Error('Unable to start test server');
        }

        wsServer.on('connect', () => {
          results.serverConnectEmitted = true;
        });

        wsServer.on('request', (request) => {
          results.requestReceived = true;

          // Wait 500 ms before accepting connection
          setTimeout(() => {
            const connection = request.accept(request.requestedProtocols[0], request.origin);

            connection.on('close', (reasonCode, description) => {
              results.connectionCloseEmitted = true;
              results.closeReasonCode = reasonCode;
              results.closeDescription = description;
              stopServer();
              resolve();
            });

            connection.on('error', () => {
              throw new Error('No error events should be received on the connection');
            });
          }, 500);
        });

        const client = new WebSocketClient();
        client.on('connect', (connection) => {
          connection.drop();
          stopServer();
          throw new Error('Client should never connect.');
        });

        client.connect('ws://localhost:64321/', ['test']);

        setTimeout(() => {
          // Bail on the connection before we hear back from the server.
          client.abort();
        }, 250);
      });
    });

    expect(results.requestReceived).toBe(true);
    expect(results.serverConnectEmitted).toBe(true);
    expect(results.connectionCloseEmitted).toBe(true);
    expect(results.closeReasonCode).toBe(1006);
    expect(results.closeDescription).toBe('TCP connection lost before handshake completed.');
  });
});
