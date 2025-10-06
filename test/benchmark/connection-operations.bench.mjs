import { bench, describe } from 'vitest';
import WebSocketConnection from '../../lib/WebSocketConnection.js';
import { MockSocket } from '../helpers/mocks.mjs';

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

// Each operation gets its own describe block so Vitest doesn't treat them as
// alternatives for comparison (like comparing different sorting algorithms).
// This allows each benchmark to be measured independently.

describe('Connection Creation', () => {
  bench('create connection instance', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
  });
});

describe('Send Small UTF-8 Message', () => {
  bench('send small UTF-8 message', () => {
    sharedConnection.sendUTF(smallMessage);
  });
});

describe('Send Medium UTF-8 Message (1KB)', () => {
  bench('send medium UTF-8 message (1KB)', () => {
    sharedConnection.sendUTF(mediumMessage);
  });
});

describe('Send Binary Message (1KB)', () => {
  bench('send binary message (1KB)', () => {
    sharedConnection.sendBytes(binaryBuffer);
  });
});

describe('Send Ping Frame', () => {
  bench('send ping frame', () => {
    sharedConnection.ping();
  });
});

describe('Send Pong Frame', () => {
  bench('send pong frame', () => {
    sharedConnection.pong();
  });
});
