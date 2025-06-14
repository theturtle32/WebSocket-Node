import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { prepare, stopServer, getPort } from '../../helpers/test-server.mjs';
import { waitForEvent, raceWithTimeout } from '../../helpers/test-utils.mjs';

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
    // Set up the client first
    const client = new WebSocketClient();
    
    // Set up promises to wait for expected events
    const requestPromise = waitForEvent(wsServer, 'request', 15000);
    const connectFailedPromise = waitForEvent(client, 'connectFailed', 15000);
    
    // Ensure client never connects (this would be an error)
    client.on('connect', (connection) => {
      connection.drop();
      throw new Error('Client should never connect successfully');
    });

    // Start the connection attempt
    client.connect(`ws://localhost:${serverPort}/`, ['test']);
    
    // Abort the client connection after a short delay to simulate TCP drop
    setTimeout(() => {
      client.abort();
    }, 250);

    try {
      // Wait for the server to receive the request
      const [request] = await requestPromise;
      expect(request).toBeDefined();
      expect(request.requestedProtocols).toContain('test');

      // Set up connection close event listener before accepting
      const connectionClosePromise = new Promise((resolve, reject) => {
        // Wait 500ms before accepting to simulate the delay
        setTimeout(() => {
          const connection = request.accept(request.requestedProtocols[0], request.origin);
          
          connection.once('close', (reasonCode, description) => {
            resolve({ reasonCode, description });
          });
          
          connection.once('error', (error) => {
            reject(new Error('No error events should be received on the connection'));
          });
        }, 500);
      });

      // Wait for both the client connection failure and the server connection close
      const [connectFailedArgs, closeResult] = await Promise.all([
        connectFailedPromise,
        raceWithTimeout(connectionClosePromise, 10000, 'Connection close event timed out')
      ]);

      // Verify the connection failure
      expect(connectFailedArgs[0]).toBeDefined(); // Error should be defined

      // Verify the connection close details
      expect(closeResult.reasonCode).toBe(1006);
      expect(closeResult.description).toBe('TCP connection lost before handshake completed.');

    } catch (error) {
      throw new Error(`Test failed: ${error.message}`);
    }
  }, 20000);
});