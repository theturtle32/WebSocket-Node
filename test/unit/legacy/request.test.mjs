import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import server from '../../shared/test-server.js';

const stopServer = server.stopServer;

describe('Request can only be rejected or accepted once', () => {
  afterAll(() => {
    stopServer();
  });

  it('should enforce single accept/reject', async () => {
    await new Promise((resolve) => {
      server.prepare((err, wsServer) => {
        if (err) {
          throw new Error('Unable to start test server');
        }

        wsServer.once('request', firstReq);
        connect(2);

        function firstReq(request) {
          const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
          const reject = request.reject.bind(request);

          expect(accept).not.toThrow(); // First call to accept() should succeed
          expect(accept).toThrow(); // Second call to accept() should throw
          expect(reject).toThrow(); // Call to reject() after accept() should throw

          wsServer.once('request', secondReq);
        }

        function secondReq(request) {
          const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
          const reject = request.reject.bind(request);

          expect(reject).not.toThrow(); // First call to reject() should succeed
          expect(reject).toThrow(); // Second call to reject() should throw
          expect(accept).toThrow(); // Call to accept() after reject() should throw

          resolve();
        }

        function connect(numTimes) {
          for (let i = 0; i < numTimes; i++) {
            const client = new WebSocketClient();
            client.connect('ws://localhost:64321/', 'foo');
            client.on('connect', (connection) => { connection.close(); });
          }
        }
      });
    });
  });
});

describe('Protocol mismatch should be handled gracefully', () => {
  let wsServer;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server.prepare((err, result) => {
        if (err) {
          throw new Error('Unable to start test server');
        }
        wsServer = result;
        resolve();
      });
    });
  });

  afterAll(() => {
    stopServer();
  });

  it('should handle mismatched protocol connection', async () => {
    await new Promise((resolve) => {
      wsServer.on('request', handleRequest);

      const client = new WebSocketClient();

      const timer = setTimeout(() => {
        throw new Error('Timeout waiting for client event');
      }, 2000);

      client.connect('ws://localhost:64321/', 'some_protocol_here');

      client.on('connect', (connection) => {
        clearTimeout(timer);
        connection.close();
        throw new Error('connect event should not be emitted on client');
      });

      client.on('connectFailed', () => {
        clearTimeout(timer);
        resolve(); // connectFailed event should be emitted on client
      });

      function handleRequest(request) {
        const accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);
        expect(accept).toThrow(); // request.accept() should throw
      }
    });
  });
});
