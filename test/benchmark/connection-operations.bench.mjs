import { bench, describe } from 'vitest';
import WebSocketConnection from '../../lib/WebSocketConnection.js';
import { MockSocket } from '../helpers/mocks.mjs';

describe('WebSocketConnection Performance', () => {
  // Pre-allocate messages and buffers outside benchmarks
  const smallMessage = 'Hello, WebSocket!';
  const mediumMessage = 'x'.repeat(1024);
  const binaryBuffer = Buffer.alloc(1024);

  // Shared connection for send operations (created once, reused across all iterations)
  // Note: We initialize this directly rather than using beforeAll() because Vitest's
  // benchmark runner doesn't execute hooks before benchmarks in the same way as test()
  const sharedSocket = new MockSocket();
  const sharedConnection = new WebSocketConnection(sharedSocket, [], 'echo-protocol', false, {});
  sharedConnection._addSocketEventListeners();
  sharedConnection.state = 'open';

  bench('create connection instance', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
  });

  bench('send small UTF-8 message', () => {
    sharedConnection.sendUTF(smallMessage);
  });

  bench('send medium UTF-8 message (1KB)', () => {
    sharedConnection.sendUTF(mediumMessage);
  });

  bench('send binary message (1KB)', () => {
    sharedConnection.sendBytes(binaryBuffer);
  });

  bench('send ping frame', () => {
    sharedConnection.ping();
  });

  bench('send pong frame', () => {
    sharedConnection.pong();
  });
});
