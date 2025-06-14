import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocketClient from '../../../lib/WebSocketClient.js';
import { prepare, stopServer, getPort } from '../../helpers/test-server.mjs';
import { waitForEvent } from '../../helpers/test-utils.mjs';

describe('WebSocketRequest', () => {
  let wsServer;

  beforeEach(async () => {
    wsServer = await prepare();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('can only be rejected or accepted once', async () => {
    // Create two clients to generate two requests
    const client1 = new WebSocketClient();
    const client2 = new WebSocketClient();
    
    // Wait for the first request
    const firstRequestPromise = waitForEvent(wsServer, 'request', 5000);
    
    client1.connect(`ws://localhost:${getPort()}/`, 'foo');
    client1.on('connect', (connection) => { connection.close(); });
    
    const [firstRequest] = await firstRequestPromise;
    
    // Test first request: accept then try to accept/reject again
    const accept1 = firstRequest.accept.bind(firstRequest, firstRequest.requestedProtocols[0], firstRequest.origin);
    const reject1 = firstRequest.reject.bind(firstRequest);

    expect(() => accept1()).not.toThrow(); // First accept should work
    expect(() => accept1()).toThrow(); // Second accept should throw
    expect(() => reject1()).toThrow(); // Reject after accept should throw

    // Wait for the second request
    const secondRequestPromise = waitForEvent(wsServer, 'request', 5000);
    
    client2.connect(`ws://localhost:${getPort()}/`, 'foo');
    client2.on('connect', (connection) => { connection.close(); });
    
    const [secondRequest] = await secondRequestPromise;

    // Test second request: reject then try to reject/accept again
    const accept2 = secondRequest.accept.bind(secondRequest, secondRequest.requestedProtocols[0], secondRequest.origin);
    const reject2 = secondRequest.reject.bind(secondRequest);

    expect(() => reject2()).not.toThrow(); // First reject should work
    expect(() => reject2()).toThrow(); // Second reject should throw
    expect(() => accept2()).toThrow(); // Accept after reject should throw
  });

  it('should handle protocol mismatch gracefully', async () => {
    const client = new WebSocketClient();
    
    // Set up promise for the request we expect
    const requestPromise = waitForEvent(wsServer, 'request', 5000);
    
    // Ensure client never connects successfully (would be an error)
    client.on('connect', (connection) => {
      connection.close();
      throw new Error('connect event should not be emitted on client for protocol mismatch');
    });
    
    // Start the connection with a specific protocol
    client.connect(`ws://localhost:${getPort()}/`, 'some_protocol_here');
    
    // Wait for the server to receive the request
    const [request] = await requestPromise;
    
    // Verify the request has the expected protocol
    expect(request.requestedProtocols).toContain('some_protocol_here');
    
    // Set up promise for connectFailed event that should happen after we reject
    const connectFailedPromise = waitForEvent(client, 'connectFailed', 5000);
    
    // Test that accepting with wrong protocol throws an error AND triggers connection failure
    const accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);
    expect(() => accept()).toThrow();
    
    // Now wait for the client to receive the connection failure
    const [error] = await connectFailedPromise;
    
    // Verify the client received the expected connection failure
    expect(error).toBeDefined();
  });
});