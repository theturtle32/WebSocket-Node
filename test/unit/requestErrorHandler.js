#!/usr/bin/env node

var test = require('tape');
var WebSocket = require('../../lib/W3CWebSocket');
var WebSocketServer = require('../../lib/WebSocketServer');
var http = require('http');
var port = 8080;

test('W3CWebSockets adding event listeners with ws.onxxxxx', function(t) {
  var server = http.createServer(function(request, response) {
    if (debug) { console.log((new Date()) + ' Received request for ' + request.url); }
    response.writeHead(404);
    response.end();
  });
  server.listen(port, function() {
    console.log((new Date()) + ' Server is listening on port ' + port);
  });

  var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
  });

  wsServer.on('request', function(carrier){
    // force a write after destroyed error
    carrier.socket.destroy();

    setTimeout(()=>{
      carrier.reject();
    }, 500);
  });

  var ws = new WebSocket('ws://localhost:8080/');

  ws.onerror = function(event) {
    t.pass('Connection should not be successful');
  };

  setTimeout(()=>{
    t.pass('process should still be running');
    ws.close();
    server.close();
    t.end();
  }, 1000);
});
