#!/usr/bin/env node

var test = require('tape');
var WebSocket = require('../../lib/W3CWebSocket');
var startEchoServer = require('../shared/start-echo-server');

test('W3CWebSockets', function(t) {
  var counter = 0;
  
  var message = "This is a test message.";
  
  startEchoServer(function(err, echoServer) {
    if (err) { return t.fail("Unable to start echo server: " + err); }
  
    ws = new WebSocket('ws://localhost:8080/');
    
    ws.onopen = function() {
      t.equal(++counter, 1, "onopen should be called first");

      ws.send(message);
    };
    ws.onerror = function(event) {
      t.fail("No errors are expected: " + event);
    };
    ws.onmessage = function(event) {
      t.equal(++counter, 2, "onmessage should be called second");
      
      t.equal(event.data, message, "Received message data should match sent message data.");
      
      ws.close();
    };
    ws.onclose = function(event) {
      t.equal(++counter, 3, "onclose should be called last");

      echoServer.kill();
      
      t.end();
    };
  });
});
