var WebSocketServer = require('../lib/WebSocketServer');
var http = require('http');
var url = require('url');

var server = http.createServer(function(request, response) {
    console.log("Received request for " + request.url);
    response.writeHead(200, {
        'Content-Type': 'text/plain'
    });
    response.end("Hello World");
});
server.listen(8080, function() {
    console.log("Server is listening on port 8080");
});

wsServer = new WebSocketServer(server, null, 'lws-mirror-protocol');

// wsServer.on('request', function(request) {
//     var origin = url.parse(request.origin);
//     if (/worlize.com$/.test(origin.hostname)) {
//         var connection = request.accept('lws-mirror-protocol', request.origin);
//         console.log("Connection accepted");
//     }
//     else {
//         request.reject(400, "Origin not allowed");
//     }
// });

var connections = [];

wsServer.on('connection', function(connection) {
    console.log("Connection accepted without request handler.");
    connections.push(connection);
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log(message.utf8Data);
            connections.forEach(function (outputConnection) {
                outputConnection.sendUTF(message.utf8Data);
            });
        }
    });
    connection.socket.on('end', function() {
        var index = connections.indexOf(connection);
        if (index !== -1) {
            console.log("Connection closed... removing connection at index " + index);
            connections.splice(index, 1);
        }
    });
    connection.socket.on('close', function() {
        var index = connections.indexOf(connection);
        if (index !== -1) {
            console.log("Connection closed... removing connection at index " + index);
            connections.splice(index, 1);
        }
    });
});
