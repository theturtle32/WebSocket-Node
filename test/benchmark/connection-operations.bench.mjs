import { bench, describe } from 'vitest';
import WebSocketConnection from '../../lib/WebSocketConnection.js';
import { MockSocket } from '../helpers/mocks.mjs';

describe('WebSocketConnection Performance', () => {
  bench('create connection instance', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
  });

  bench('send small UTF-8 message', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
    connection.state = 'open';
    connection.sendUTF('Hello, WebSocket!');
  });

  bench('send medium UTF-8 message (1KB)', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
    connection.state = 'open';
    const message = 'x'.repeat(1024);
    connection.sendUTF(message);
  });

  bench('send binary message (1KB)', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
    connection.state = 'open';
    const buffer = Buffer.alloc(1024);
    connection.sendBytes(buffer);
  });

  bench('send ping frame', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
    connection.state = 'open';
    connection.ping();
  });

  bench('send pong frame', () => {
    const socket = new MockSocket();
    const connection = new WebSocketConnection(socket, [], 'echo-protocol', false, {});
    connection._addSocketEventListeners();
    connection.state = 'open';
    connection.pong();
  });
});
