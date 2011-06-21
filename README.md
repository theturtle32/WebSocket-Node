WebSocket Client & Server Implementation for Node
=================================================

*WARNING: This is an experimental library implementing the most recent draft of the WebSocket proposal.*

Overview
--------
This code is currently unproven.  It should be considered alpha quality, and is not recommended for production use, though it is used in production on worlize.com.  Your mileage may vary.

This is a pure JavaScript implementation of the WebSocket Draft -09 for Node.  There are some example client and server applications that implement various interoperability testing protocols in the "test" folder.

For a WebSocket -09 client written in Flash see my [AS3WebScocket](https://github.com/Worlize/AS3WebSocket) project.

*There will not be a draft-08 implementation, as the -08 specification was only out for a week before being superseded by -09.*

If you're looking for the version supporting draft-07 or draft-06, see the draft-07 or draft-06 branches.  It will not be maintained, as I plan to track each subsequent draft of the protocol until it's finalized, and will ultimately be supporting *only* the final draft.

**Tested against Node version 0.4.7.**  It may work in earlier versions but I haven't tried it.  YMMV.

Current Features:
-----------------
- Draft-09 framing and handshake
- Can handle/aggregate received fragmented messages
- Can fragment outgoing messages
- Router to mount multiple applications to various path and protocol combinations
- Tunable settings
  - Max Receivable Frame Size
  - Max Aggregate ReceivedMessage Size
  - Whether to fragment outgoing messages
  - Fragmentation chunk size for outgoing messages
  - Whether to automatically send ping frames for the purposes of keepalive
  - Keep-alive ping interval
  - Whether or not to automatically assemble received fragments (allows application to handle individual fragments directly)
  - How long to wait after sending a close frame for acknowledgment before closing the socket.


Known Issues/Missing Features:
------------------------------
- No API for user-provided protocol extensions.
- The 'deflate-stream' extension put forward as a proof of concept extension in the protocol draft is not implemented.
- Haven't tested TLS.  (Perhaps this is handled automatically by attaching the WebSocket server to a https.createServer instead of http.createServer?)


Usage Examples
==============

Server Example
--------------

Here's a short example showing a server that echos back anything sent to it, whether utf-8 or binary.

    #!/usr/bin/env node
    var WebSocketServer = require('../lib/WebSocketServer');
    var http = require('http');

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

Client Example
--------------

This is a simple example client that will print out any utf-8 messages it receives on the console, and periodically sends a random number.

    #!/usr/bin/env node
    var WebSocketClient = require('../lib/WebSocketClient');

    var client = new WebSocketClient();

    client.on('error', function(error) {
        console.log("Connect Error: " + error.toString());
    });

    client.on('connect', function(connection) {
        console.log("WebSocket client connected");
        connection.on('error', function(error) {
            console.log("Connection Error: " + error.toString());
        });
        connection.on('close', function() {
            console.log("dumb-increment-protocol Connection Closed");
        })
        connection.on('message', function(message) {
            console.log("Received: '" + message.utf8Data + "'");
        });
        
        function sendNumber() {
            if (connection.connected) {
                var number = Math.round(Math.random() * 0xFFFFFF);
                connection.sendUTF(number);
                setTimeout(sendNumber, 1000);
            }
        }
        sendNumber();
    });

    client.connect("ws://localhost:8080/", ['echo-protocol']);
    
Request Router Example
----------------------

For an example of using the request router, see `libwebsockets-test-server.js` in the `test` folder.


Documentation
=============

For more complete documentation, see the [Documentation Wiki](https://github.com/Worlize/WebSocket-Node/wiki/Documentation).