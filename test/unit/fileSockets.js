#!/usr/bin/env node

var test = require('tape');
var http = require('http');
var WebSocketServer = require('../../lib/WebSocketServer');
var WebSocketClient = require('../../lib/WebSocketClient');


function serverSide(t, sockFname, addr) {
  var server = http.createServer((request, response) => {
    response.writeHead(404);
    response.end();
  });
  if (addr) {
    server.listen(sockFname, addr, () => { });
  } else {
    server.listen(sockFname, () => { });
  }
  server.on('error', (e) => {
    t.assert(true, false, "errors should not happen");
  });

  var wsServer = new WebSocketServer({ httpServer: server, autoAcceptConnections: false });
  wsServer.on('request', (request) => {
    var connection = request.accept('sockfname-protocol', request.origin);
    connection.on('message', function(message) {
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

function clientSide(t, sockFname, addr, cb) {
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
        connection.send("ping");
    });
    if (typeof(sockFname) == "number") {
      if (addr.includes(':')) {
        addr = "["+addr+"]";
      }
      var url = 'ws://'+addr+':'+sockFname+'/';
      client.connect(url, 'sockfname-protocol');
      //client.connect('ws://[::1]:'+sockFname+'/', 'sockfname-protocol');
    } else {
      client.connect('ws://['+sockFname+']/', 'sockfname-protocol');
    }
}

function run(t, socket, adr, finCb) {
  var server = serverSide(t, socket, adr);
  var i = 0;
  var cb = function() {
    if (i < 10) {
      ++i;
      clientSide(t, socket, adr, cb);
    } else {
      server.close();
      finCb && finCb();
    }
  }
  clientSide(t, socket, adr, cb);
}

test('use ws over file sockets', function(t) {
  t.plan(10 + 1);
  var sock = "./S.test."+process.pid;
  run(t, sock);
});

test('use ws over ipv4 tcp sockets', function(t) {
  t.plan(10 + 1);
  run(t, 4711, "127.0.0.1");
});

test('use ws over ipv6 tcp sockets', function(t) {
  t.plan(10 + 1);
  run(t, 4711, "::1");
});
