#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var http = require('http');
var url = require('url');
var fs = require('fs');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    if (request.url == "/") {
        fs.readFile('mirror-test.html', 'utf8', function(err, data) {
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

wsServer = new WebSocketServer(server, null, 'lws-mirror-protocol');

// wsServer.on('request', function(request) {
//     var origin = url.parse(request.origin);
//     if (/worlize.com$/.test(origin.hostname)) {
//         request.accept('lws-mirror-protocol', request.origin);
//     }
//     else {
//         request.reject(400, "Origin not allowed");
//     }
// });

var connections = [];

wsServer.on('connection', function(connection) {
    console.log((new Date()) + " Connection accepted.");
    connections.push(connection);
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            // console.log((new Date()) + " " + message.utf8Data);
            connections.forEach(function (outputConnection) {
                outputConnection.sendUTF(message.utf8Data);
            });
        }
    });
    connection.on('close', function(connection) {
        var index = connections.indexOf(connection);
        if (index !== -1) {
            console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
            connections.splice(index, 1);
        }
    });
});
