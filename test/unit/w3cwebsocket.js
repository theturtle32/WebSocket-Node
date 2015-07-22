#!/usr/bin/env node

var test = require('tape');
var WebSocket = require('../../lib/W3CWebSocket');
var startEchoServer = require('../shared/start-echo-server');

test('W3CWebSockets adding event listeners with ws.onxxxxx', function(t) {
  var counter = 0;
  var message = 'This is a test message.';

  startEchoServer(function(err, echoServer) {
    if (err) { return t.fail('Unable to start echo server: ' + err); }

    var ws = new WebSocket('ws://localhost:8080/');

    ws.onopen = function() {
      t.equal(++counter, 1, 'onopen should be called first');

      ws.send(message);
    };
    ws.onerror = function(event) {
      t.fail('No errors are expected: ' + event);
    };
    ws.onmessage = function(event) {
      t.equal(++counter, 2, 'onmessage should be called second');

      t.equal(event.data, message, 'Received message data should match sent message data.');

      ws.close();
    };
    ws.onclose = function(event) {
      t.equal(++counter, 3, 'onclose should be called last');

      echoServer.kill();

      t.end();
    };
  });
});

test('W3CWebSockets adding event listeners with ws.addEventListener', function(t) {
  var counter = 0;
  var message = 'This is a test message.';

  startEchoServer(function(err, echoServer) {
    if (err) { return t.fail('Unable to start echo server: ' + err); }

    var ws = new WebSocket('ws://localhost:8080/');

    ws.addEventListener('open', function() {
      t.equal(++counter, 1, '"open" should be fired first');

      ws.send(message);
    });
    ws.addEventListener('error', function(event) {
      t.fail('No errors are expected: ' + event);
    });
    ws.addEventListener('message', function(event) {
      t.equal(++counter, 2, '"message" should be fired second');

      t.equal(event.data, message, 'Received message data should match sent message data.');

      ws.close();
    });
    ws.addEventListener('close', function(event) {
      t.equal(++counter, 3, '"close" should be fired');
    });
    ws.addEventListener('close', function(event) {
      t.equal(++counter, 4, '"close" should be fired one more time');

      echoServer.kill();

      t.end();
    });
  });
});
