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

wsServer = new WebSocketServer(server, null, 'dumb-increment-protocol');

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

wsServer.on('connection', function(connection) {
    console.log("Connection accepted.");
    var number = 0;
    connection.timerInterval = setInterval(function() {
        connection.sendUTF((number++).toString(10));
    }, 50);
    connection.socket.on('end', function() {
        clearInterval(connection.timerInterval);
        console.log("Connection end");
    });
    connection.socket.on('close', function(hadError) {
        clearInterval(connection.timerInterval);
        if (hadError) {
            console.log("Connection closed with an error.");
        }
        else {
            console.log("Connection closed");
        }
    });
});
