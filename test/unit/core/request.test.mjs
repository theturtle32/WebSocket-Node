import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { prepare, stopServer, getPort } from '../../helpers/test-server.mjs';

describe('WebSocketRequest', () => {
  let wsServer;

  beforeEach(async () => {
    wsServer = await prepare();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('can only be rejected or accepted once', async () => {
    return new Promise((resolve, reject) => {
      let testsCompleted = 0;
      const totalTests = 6;
      
      function checkCompletion() {
        testsCompleted++;
        if (testsCompleted === totalTests) {
          resolve();
        }
      }

      wsServer.once('request', firstReq);
      connect(2);

      function firstReq(request) {
        const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
        const reject = request.reject.bind(request);

        expect(() => accept()).not.toThrow();
        checkCompletion();
        
        expect(() => accept()).toThrow();
        checkCompletion();
        
        expect(() => reject()).toThrow();
        checkCompletion();

        wsServer.once('request', secondReq);
      }

      function secondReq(request) {
        const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
        const reject = request.reject.bind(request);

        expect(() => reject()).not.toThrow();
        checkCompletion();
        
        expect(() => reject()).toThrow();
        checkCompletion();
        
        expect(() => accept()).toThrow();
        checkCompletion();
      }

      function connect(numTimes) {
        let client;
        for (let i = 0; i < numTimes; i++) {
          client = new WebSocketClient();
          client.connect(`ws://localhost:${getPort()}/`, 'foo');
          client.on('connect', (connection) => { connection.close(); });
        }
      }
    });
  });

  it('should handle protocol mismatch gracefully', async () => {
    return new Promise((resolve, reject) => {
      let requestHandled = false;
      let clientEventReceived = false;
      
      function checkCompletion() {
        if (requestHandled && clientEventReceived) {
          resolve();
        }
      }

      wsServer.on('request', handleRequest);

      const client = new WebSocketClient();

      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for client event'));
      }, 2000);

      client.connect(`ws://localhost:${getPort()}/`, 'some_protocol_here');
      
      client.on('connect', (connection) => {
        clearTimeout(timer);
        connection.close();
        reject(new Error('connect event should not be emitted on client'));
      });
      
      client.on('connectFailed', () => {
        clearTimeout(timer);
        clientEventReceived = true;
        checkCompletion();
      });

      function handleRequest(request) {
        const accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);
        expect(() => accept()).toThrow();
        requestHandled = true;
        checkCompletion();
      }
    });
  });
});