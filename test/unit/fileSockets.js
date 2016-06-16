#!/usr/bin/env node

var test = require('tape');
var http = require('http');
var WebSocketServer = require('../../lib/WebSocketServer');
var WebSocketClient = require('../../lib/WebSocketClient');


function serverSide(t, sockFname) {
  var server = http.createServer((request, response) => {
    response.writeHead(404);
    response.end();
  });
  server.listen(sockFname, () => { });
  server.on('error', (e) => {
    t.assert(true, false, "errors should not happen");
  });

  var wsServer = new WebSocketServer({ httpServer: server, autoAcceptConnections: false });
  wsServer.on('request', (request) => {
    var connection = request.accept('sockfname-protocol', request.origin);
    connection.on('message', function(message) {
      //console.log(">>",message);
      switch (message.utf8Data)  {
        case "ping" :
          connection.send("pong");
          break;
        case "bye" :
          connection.close();
          break;
      }
    });
    connection.on('close', function(reasonCode, description) {
    });
  });
  return server;
}

function clientSide(t, sockFname, cb) {
    let client = new WebSocketClient();
    client.on('connectFailed', (error) => {
      console.error(error);
      t.assert(true, false, "errors should not happen");
    });

    client.on('connect', (connection) => {
        connection.on('error', (error) => {
          t.assert(true, false, "errors should not happen");
        });
        connection.on('close', function() {
          t.assert(true, true);
          cb();
        });
        connection.on('message', function(message) {
          switch (message.utf8Data) {
            case "pong" :
              connection.send("bye");
          }
        });
        //console.log("<<ping");
        connection.send("ping");
    });
    if (typeof(sockFname) == "number") {
      client.connect('ws://localhost:'+sockFname+'/', 'sockfname-protocol');
    } else {
      client.connect('wsf://'+sockFname+'/', 'sockfname-protocol');
    }
}

function run(t, socket, finCb) {
  var server = serverSide(t, socket);
  var i = 0;
  var cb = function() {
    //console.log("i="+i)
    if (i < 10) {
      ++i;
      clientSide(t, socket, cb);
    } else {
      server.close();
      finCb && finCb();
    }
  }
  clientSide(t, socket, cb);
}

test('use wsf to connect over file sockets', function(t) {
  t.plan(10 + 1);
  var sock = "./S.test."+process.pid;
  run(t, sock);
});

test('use wsf to connect over tcp sockets', function(t) {
  t.plan(10 + 1);
  run(t, 4711);
});
