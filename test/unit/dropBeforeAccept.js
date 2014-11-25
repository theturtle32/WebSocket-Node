#!/usr/bin/env node

var test = require('tape');
var http = require('http');

var WebSocketServer = require('../../lib/WebSocketServer');
var WebSocketClient = require('../../lib/WebSocketClient');

var server;
var wsServer;

function prepare(callback) {
  server = http.createServer(function(request, response) {
    response.writeHead(404);
    response.end();
  });

  wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
  });

  server.listen(64321, callback);
}

function stopServer() {
  wsServer.shutDown();
  server.close();
}

test('Drop TCP Connection Before server accepts the request', function(t) {
  t.plan(5);
  
  prepare(function(err) {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    
    wsServer.on('connect', function(connection) {
      t.pass('Server should emit connect event');
    });
    
    wsServer.on('request', function(request) {
      t.pass('Request received');

      // Wait 500 ms before accepting connection
      setTimeout(function() {
        var connection = request.accept(request.requestedProtocols[0], request.origin);
        
        connection.on('close', function(reasonCode, description) {
          t.pass('Connection should emit close event');
          t.equal(reasonCode, 1006, 'Close reason code should be 1006');
          t.equal(description,
            'TCP connection lost before handshake completed.',
            'Description should be correct');
          t.end();
          stopServer();
        });
        
        connection.on('error', function(error) {
          t.fail("No error events should be received on the connection");
          stopServer();
        });
        
      }, 500);
    });
    
    var client = new WebSocketClient();
    client.on('connect', function(connection) {
      t.fail('Client should never connect.');
      connection.drop();
      stopServer();
      t.end();
    });
    
    client.connect('ws://localhost:64321/', ['test']);
    
    setTimeout(function() {
      // Bail on the connection before we hear back from the server.
      client.abort();
    }, 250);
    
  });
});
