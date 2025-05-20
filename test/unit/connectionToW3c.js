#!/usr/bin/env node

var test = require('tape');
var WebSocket = require('../../lib/W3CWebSocket');
var connToW3C = require('../../lib/W3CWebSocketWrapper').connToW3C;
var server = require('../shared/test-server');
var stopServer = server.stopServer;

test('conn2W3C adding event listeners with ws.onxxxxx', function(t) {
  var counter = 0;
  var message = 'This is a test message.';
  t.on('end', ()=>{
    stopServer();
  });
  server.prepare(function(err, wsServer) {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    wsServer.once('request', function(request){
      var connection = request.accept();
      var sw3c = connToW3C(connection);
      // open gets called within the connToW3C. It cannot be listened to
      ++counter;
      sw3c.send(message);
      sw3c.onerror = function(event) {
        t.fail('No errors are expected: ' + event);
      };
      sw3c.onmessage = function(event) {
        t.equal(++counter, 2, 'onmessage should be called second');

        t.equal(event.data, message, 'Server received message data should match sent message data.');
        sw3c.close();
      };
      sw3c.onclose = function(event) {
        t.equal(++counter, 3, 'onclose should be called last');
        t.end();
      };
    });

    var cw3c = new WebSocket('ws://localhost:64321/');
    cw3c.onmessage = function(event){
      t.equal(event.data, message, 'Client received message data should match sent message data.');
      cw3c.send(event.data);
    };
  });
});

test('conn2W3C adding event listeners with ws.addEventListener', function(t) {
  var counter = 0;
  var message = 'This is a test message.';
  t.on('end', function(){
    stopServer();
  });
  server.prepare(function(err, wsServer) {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    wsServer.once('request', function(request){
      var connection = request.accept();
      var sw3c = connToW3C(connection);
      // open gets called within the connToW3C. It cannot be listened to
      ++counter;
      sw3c.send(message);
      sw3c.addEventListener('error', function(event) {
        t.fail('No errors are expected: ' + event);
      });
      sw3c.addEventListener('message', function(event) {
        t.equal(++counter, 2, 'onmessage should be called second');

        t.equal(event.data, message, 'Server received message data should match sent message data.');
        sw3c.close();
      });
      sw3c.addEventListener('close', function(event) {
        t.equal(++counter, 3, 'onclose should be called last');
        t.end();
      });
    });

    var cw3c = new WebSocket('ws://localhost:64321/');
    cw3c.addEventListener('message', function(event){
      t.equal(event.data, message, 'Client received message data should match sent message data.');
      cw3c.send(event.data);
    });
  });
});

test('conn2W3C open event doesn\'t get emitted externally', function(t) {
  var message = 'This is a test message.';
  t.on('end', function(){
    stopServer();
  });
  server.prepare(function(err, wsServer) {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    wsServer.once('request', function(request){
      var connection = request.accept();
      var sw3c = connToW3C(connection);
      sw3c.addEventListener('open', function(){
        t.fail('open event fired');
      });
      sw3c.addEventListener('message', function(event){
        t.equal(event.data, message, 'Server received message data should match sent message data.');
        sw3c.close();
      });
      sw3c.addEventListener('close', function() {
        t.end();
      });
    });
    var cw3c = new WebSocket('ws://localhost:64321/');
    setTimeout(function(){
      cw3c.send(message);
    }, 100);
  });
});
