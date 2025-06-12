#!/usr/bin/env node

const test = require('tape');
const WebSocket = require('../../lib/W3CWebSocket');
const startEchoServer = require('../shared/start-echo-server');

test('W3CWebSockets adding event listeners with ws.onxxxxx', function(t) {
  let counter = 0;
  const message = 'This is a test message.';

  startEchoServer((err, echoServer) => {
    if (err) { return t.fail('Unable to start echo server: ' + err); }

    const ws = new WebSocket('ws://localhost:8080/');

    ws.onopen = () => {
      t.equal(++counter, 1, 'onopen should be called first');

      ws.send(message);
    };
    ws.onerror = (event) => {
      t.fail('No errors are expected: ' + event);
    };
    ws.onmessage = (event) => {
      t.equal(++counter, 2, 'onmessage should be called second');

      t.equal(event.data, message, 'Received message data should match sent message data.');

      ws.close();
    };
    ws.onclose = (event) => {
      t.equal(++counter, 3, 'onclose should be called last');

      echoServer.kill();

      t.end();
    };
  });
});

test('W3CWebSockets adding event listeners with ws.addEventListener', function(t) {
  let counter = 0;
  const message = 'This is a test message.';

  startEchoServer((err, echoServer) => {
    if (err) { return t.fail('Unable to start echo server: ' + err); }

    const ws = new WebSocket('ws://localhost:8080/');

    ws.addEventListener('open', () => {
      t.equal(++counter, 1, '"open" should be fired first');

      ws.send(message);
    });
    ws.addEventListener('error', (event) => {
      t.fail('No errors are expected: ' + event);
    });
    ws.addEventListener('message', (event) => {
      t.equal(++counter, 2, '"message" should be fired second');

      t.equal(event.data, message, 'Received message data should match sent message data.');

      ws.close();
    });
    ws.addEventListener('close', (event) => {
      t.equal(++counter, 3, '"close" should be fired');
    });
    ws.addEventListener('close', (event) => {
      t.equal(++counter, 4, '"close" should be fired one more time');

      echoServer.kill();

      t.end();
    });
  });
});
