WebSocket Client & Server Implementation for Node
=================================================

*WARNING: This is a library implementing only the most recent draft of the WebSocket protocol.  It will not work with production browsers until new versions are released that support it.*

**Note about FireFox 6:  Firefox 6 re-enables support for WebSockets by default.  It uses a prefixed constructor name, MozWebSocket(), to avoid conflicting with already deployed scripts.  It also implements draft-07, so if you want to target Firefox 6, you will need to checkout my draft-07 branch, not the latest one.**

***If you need to simultaneously support older production browser versions that had implemented draft-75/draft-76/draft-00, take a look here: https://gist.github.com/1148686***

Overview
--------
This code is currently unproven.  It should be considered alpha quality, and is not recommended for production use, though it is used in production on worlize.com.  Your mileage may vary.

This is a pure JavaScript implementation of the WebSocket protocol version 8 for Node.  There are some example client and server applications that implement various interoperability testing protocols in the "test" folder.

For a WebSocket draft-08/-09/-10 client written in Flash see my [AS3WebScocket](https://github.com/Worlize/AS3WebSocket) project.

*The latest three drafts of the WebSocket protocol, draft-08, draft-09, and draft-10, are functionally identical and implement the same wire protocol, protocol version "8".  They are all interoperable, with only editorial changes across the three drafts.  The current implementation of WebSocket-Node works with all three.*

If you're looking for the version supporting draft-07 or draft-06, see the draft-07 or draft-06 branches.  Previous draft branches will not be maintained, as I plan to track each subsequent draft of the protocol until it's finalized, and will ultimately be supporting *only* the final draft.

**Tested against Node version 0.4.7.**  It may work in earlier versions but I haven't tried it.  YMMV.

Browser Support
---------------

* Firefox Aurora 7 (Protocol Version 8)
* Chrome 14 (Beta channel) (Protocol Version 8)

Installation
------------
In your project root:

    $ npm install websocket
  
Then in your code:

    var WebSocketServer = require('websocket').server;
    var WebSocketClient = require('websocket').client;
    var WebSocketFrame  = require('websocket').frame;
    var WebSocketRouter = require('websocket').router;

Current Features:
-----------------
- Protocol version "8" (Draft-08/-09/-10) framing and handshake
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
    var WebSocketServer = require('websocket').server;
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
    var WebSocketClient = require('websocket').client;

    var client = new WebSocketClient();

    client.on('connectFailed', function(error) {
        console.log("Connect Error: " + error.toString());
    });

    client.on('connect', function(connection) {
        console.log("WebSocket client connected");
        connection.on('error', function(error) {
            console.log("Connection Error: " + error.toString());
        });
        connection.on('close', function() {
            console.log("echo-protocol Connection Closed");
        })
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                console.log("Received: '" + message.utf8Data + "'");
            }
        });
        
        function sendNumber() {
            if (connection.connected) {
                var number = Math.round(Math.random() * 0xFFFFFF);
                connection.sendUTF(number.toString());
                setTimeout(sendNumber, 1000);
            }
        }
        sendNumber();
    });

    client.connect("ws://localhost:8080/", 'echo-protocol');
    
Request Router Example
----------------------

For an example of using the request router, see `libwebsockets-test-server.js` in the `test` folder.


Documentation
=============

For more complete documentation, see the [Documentation Wiki](https://github.com/Worlize/WebSocket-Node/wiki/Documentation).

Resources
---------

A presentation on the state of the WebSockets protocol that I gave on July 23, 2011 at the LA Hacker News meetup.  [WebSockets: The Real-Time Web, Delivered](http://www.scribd.com/doc/60898569/WebSockets-The-Real-Time-Web-Delivered)