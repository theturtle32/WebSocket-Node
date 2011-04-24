#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var WebSocketRouter = require('../lib/WebSocketRouter');
var http = require('http');
var url = require('url');
var fs = require('fs');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    if (request.url == "/") {
        fs.readFile('libwebsockets-test.html', 'utf8', function(err, data) {
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

wsServer = new WebSocketServer({
    httpServer: server,
    maxReceivedFrameSize: 6
});

var router = new WebSocketRouter();
router.attachServer(wsServer);


var mirrorConnections = [];

router.mount('*', 'lws-mirror-protocol', function(request) {
    // Should do origin verification here. You have to pass the accepted
    // origin into the accept method of the request.
    var connection = request.accept(request.origin);
    console.log((new Date()) + " lws-mirror-protocol connection accepted from " + connection.remoteAddress);
    
    mirrorConnections.push(connection);
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            mirrorConnections.forEach(function (outputConnection) {
                outputConnection.sendUTF(message.utf8Data);
            });
        }
    });
    connection.on('close', function(connection) {
        var index = mirrorConnections.indexOf(connection);
        if (index !== -1) {
            console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
            mirrorConnections.splice(index, 1);
        }
    });
});

router.mount('*', 'dumb-increment-protocol', function(request) {
    // Should do origin verification here. You have to pass the accepted
    // origin into the accept method of the request.
    var connection = request.accept(request.origin);
    console.log((new Date()) + " dumb-increment-protocol onnection accepted from " + connection.remoteAddress);

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
                console.log((new Date()) + " increment reset received");
                number = 0;
            }
        }
    });
    connection.on('close', function(connection) {
        console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected");
    });
});
