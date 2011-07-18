#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var WebSocketRouter = require('../lib/WebSocketRouter');
var http = require('http');
var url = require('url');
var fs = require('fs');

var args = { /* defaults */
    secure: false
};

/* Parse command line options */
var pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach(function(value) {
    var match = pattern.exec(value);
    if (match) {
        args[match[1]] = match[2] ? match[2] : true;
    }
});

args.protocol = args.secure ? 'wss:' : 'ws:'

if (!args.port) {
    console.log("WebSocket-Node: Test Server implementing Andy Green's")
    console.log("libwebsockets-test-server protocols.");
    console.log("Usage: ./libwebsockets-test-server.js --port=8080 [--secure]");
    console.log("");
    return;
}

if (args.secure) {
    console.log("WebSocket-Node: Test Server implementing Andy Green's")
    console.log("libwebsockets-test-server protocols.");
    console.log("ERROR: TLS is not yet supported.");
    console.log("");
    return;
}

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
server.listen(args.port, function() {
    console.log((new Date()) + " Server is listening on port " + args.port);
});

wsServer = new WebSocketServer({
    httpServer: server
});

var router = new WebSocketRouter();
router.attachServer(wsServer);


var mirrorConnections = [];

var mirrorHistory = [];

router.mount('*', 'lws-mirror-protocol', function(request) {
    // Should do origin verification here. You have to pass the accepted
    // origin into the accept method of the request.
    var connection = request.accept(request.origin);
    console.log((new Date()) + " lws-mirror-protocol connection accepted from " + connection.remoteAddress);


    
    if (mirrorHistory.length > 0) {
        var historyString = mirrorHistory.join('');
        console.log((new Date()) + " sending mirror protocol history to client; " + connection.remoteAddress + " : " + Buffer.byteLength(historyString) + " bytes");
        
        connection.sendUTF(historyString);
    }
    
    mirrorConnections.push(connection);
    
    connection.on('message', function(message) {
        // We only care about text messages
        if (message.type === 'utf8') {
            // Clear canvas command received
            if (message.utf8Data === 'clear;') {
                mirrorHistory = [];
            }
            else {
                // Record all other commands in the history
                mirrorHistory.push(message.utf8Data);
            }

            // Re-broadcast the command to all connected clients
            mirrorConnections.forEach(function (outputConnection) {
                outputConnection.sendUTF(message.utf8Data);
            });
        }
    });

    connection.on('close', function(connection) {
        var index = mirrorConnections.indexOf(connection);
        if (index !== -1) {
            console.log((new Date()) + " lws-mirror-protocol peer " + connection.remoteAddress + " disconnected.");
            mirrorConnections.splice(index, 1);
        }
    });
    
    connection.on('error', function(error) {
        console.log("Connection error for peer " + connection.remoteAddress + ": " + error);
    });
});

router.mount('*', 'dumb-increment-protocol', function(request) {
    // Should do origin verification here. You have to pass the accepted
    // origin into the accept method of the request.
    var connection = request.accept(request.origin);
    console.log((new Date()) + " dumb-increment-protocol connection accepted from " + connection.remoteAddress);

    var number = 0;
    connection.timerInterval = setInterval(function() {
        connection.sendUTF((number++).toString(10));
    }, 50);
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
        console.log((new Date()) + " dumb-increment-protocol peer " + connection.remoteAddress + " disconnected");
    });
});

console.log("WebSocket-Node: Test Server implementing Andy Green's")
console.log("libwebsockets-test-server protocols.");
console.log("Point your draft-09 complant browser to http://localhost:" + args.port + "/");
