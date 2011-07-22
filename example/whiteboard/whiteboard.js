// Enable us to simply require('websocket') from within the examples directory
require.paths.unshift(__dirname + '/../../lib/');

var WebSocketServer = require('websocket').server;
var express = require('express');

var app = express.createServer();

app.configure(function() {
    app.use(express.static(__dirname + "/public"));
    app.set('views', __dirname);
    app.set('view engine', 'ejs');
});
app.get('/', function(req, res) {
    res.render('index', { layout: false });
});
app.listen(8080);


var wsServer = new WebSocketServer({
    httpServer: app,
    
    // Firefox 7 alpha has a bug that drops the
    // connection on large fragmented messages
    fragmentOutgoingMessages: false
});

var connections = [];
var canvasCommands = [];

wsServer.on('request', function(request) {
    var connection = request.accept('whiteboard-example', request.origin);
    connections.push(connection);
    
    console.log(connection.remoteAddress + " connected");
    
    // Send all the existing canvas commands to the new client
    connection.sendUTF(JSON.stringify({
        msg: "initCommands",
        data: canvasCommands
    }));
    
    // Handle closed connections
    connection.on('close', function() {
        console.log(connection.remoteAddress + " disconnected");
        
        var index = connections.indexOf(connection);
        if (index !== -1) {
            // remove the connection from the pool
            connections.splice(index, 1);
        }
    });
    
    // Handle incoming messages
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            try {
                var command = JSON.parse(message.utf8Data);

                if (command.msg === 'clear') {
                    canvasCommands = [];
                }
                else {
                    canvasCommands.push(command);
                }

                // rebroadcast command to all clients
                connections.forEach(function(destination) {
                    destination.sendUTF(message.utf8Data);
                });
            }
            catch(e) {
                // do nothing if there's an error.
            }
        }
    });
});

console.log("Whiteboard test app ready");
