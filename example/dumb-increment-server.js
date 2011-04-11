#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var http = require('http');
var url = require('url');
var fs = require('fs');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    if (request.url == "/") {
        fs.readFile('increment-test.html', 'utf8', function(err, data) {
            if (err) {
                response.writeHead(404);
                response.end();
            }
            else {
                response.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                response.end(data);
            }
        });
    }
    else {
        response.writeHead(404);
        response.end();
    }
});
server.listen(8080, function() {
    console.log((new Date()) + " Server is listening on port 8080");
});

wsServer = new WebSocketServer(server, null, 'dumb-increment-protocol');

wsServer.on('connection', function(connection) {
    console.log((new Date()) + " Connection accepted from " + connection.remoteAddress);
    var number = 0;
    connection.timerInterval = setInterval(function() {
        connection.sendUTF((number++).toString(10));
    }, 0);
    connection.on('close', function() {
        clearInterval(connection.timerInterval);
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            if (message.utf8Data === 'reset\n') {
                console.log((new Date()) + " Reset received");
                number = 0;
            }
        }
    });
    connection.on('close', function(connection) {
        console.log((new Date()) + " Client " + connection.remoteAddress + " disconnected");
    });
});
