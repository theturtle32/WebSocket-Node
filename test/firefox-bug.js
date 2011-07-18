#!/usr/bin/env node

var WebSocketServer = require('../lib/WebSocketServer');
var WebSocketRouter = require('../lib/WebSocketRouter');
var http = require('http');
var url = require('url');
var fs = require('fs');

var args = {
    "no-fragmentation": false,
    "fragment": 16384
};

/* Parse command line options */
var pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach(function(value) {
    var match = pattern.exec(value);
    if (match) {
        args[match[1]] = match[2] ? match[2] : true;
    }
});

args.protocol = 'ws:';

if (!args.port) {
    console.log("WebSocket-Node: Example case for Firefox Aurora 7.0a2 fragmentation bug");
    console.log("Usage: ./firefox-bug.js --port=8080");
    console.log("");
    return;
}

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    if (request.url == "/") {
        fs.readFile('firefox-bug.html', 'utf8', function(err, data) {
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
    httpServer: server,
    fragmentOutgoingMessages: !args['no-fragmentation'],
    fragmentationThreshold: parseInt(args['fragment'], 10)
});

var router = new WebSocketRouter();
router.attachServer(wsServer);


var connections = [];


var lorem = "Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat.";


router.mount('*', 'firefox-bug', function(request) {
    var connection = request.accept(request.origin);
    console.log((new Date()) + " connection accepted from " + connection.remoteAddress);

    
    connections.push(connection);
    
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            var length = 0;
            var match = /sendMessage\|(\d+)/.exec(message.utf8Data);
            if (match) {
                var requestedLength = parseInt(match[1], 10);
                var longLorem = '';
                while (length < requestedLength) {
                    longLorem += ("  " + lorem);
                    length = Buffer.byteLength(longLorem);
                }
                longLorem = longLorem.slice(0,requestedLength);
                length = Buffer.byteLength(longLorem);
                connection.sendUTF(longLorem);
                if (length > 0) {
                    console.log((new Date()) + " sent " + length + " byte message to " + connection.remoteAddress);
                }
            }
        }
    });

    connection.on('close', function(connection) {
        var index = connections.indexOf(connection);
        if (index !== -1) {
            console.log((new Date()) + " peer " + connection.remoteAddress + " disconnected.");
            connections.splice(index, 1);
        }
    });
    
    connection.on('error', function(error) {
        console.log("Connection error for peer " + connection.remoteAddress + ": " + error);
    });
});

console.log("WebSocket-Node: Firefox-bug test server.")
console.log("Point Firefox Aurora 7.0a2 at http://localhost:" + args.port + "/");
if (args['no-fragmentation']) {
    console.log("Fragmentation disabled.");
}
else {
    console.log("Fragmenting messages at " + wsServer.config.fragmentationThreshold + " bytes");
}
