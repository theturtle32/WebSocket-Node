#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var http = require('http');
var url = require('url');
var fs = require('fs');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8080, function() {
    console.log((new Date()) + " Server is listening on port 8080");
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true
});

wsServer.on('connect', function(connection) {
    console.log((new Date()) + " Connection accepted.");
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log("Received Message: " + message.utf8Data);
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
