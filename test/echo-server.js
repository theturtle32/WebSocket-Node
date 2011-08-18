#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var http = require('http');
var url = require('url');
var fs = require('fs');

var args = { /* defaults */
    port: '8080'
};

/* Parse command line options */
var pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach(function(value) {
    var match = pattern.exec(value);
    if (match) {
        args[match[1]] = match[2] ? match[2] : true;
    }
});

var port = parseInt(args.port, 10);

console.log("WebSocket-Node: echo-server");
console.log("Usage: ./echo-server.js [--port=8080]");

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(port, function() {
    console.log((new Date()) + " Server is listening on port " + port);
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
});

wsServer.on('connect', function(connection) {
    console.log((new Date()) + " Connection accepted.");
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log("Received utf-8 message of " + message.utf8Data.length + " characters.");
            connection.sendUTF(message.utf8Data);
        }
        else if (message.type === 'binary') {
            console.log("Received Binary Message of " + message.binaryData.length + " bytes");
            connection.sendBytes(message.binaryData);
        }
    });
    connection.on('close', function(connection) {
        console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
    });
});
