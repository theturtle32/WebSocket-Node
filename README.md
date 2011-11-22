WebSocket Client & Server Implementation for Node
=================================================

Browser Support
---------------

* Firefox 7 (Old) (Protocol Version 8)
* Firefox 8 (Stable) (Protocol Version 8)
* Firefox 9 (Beta) (Protocol Version 8)
* Chrome 14 (Old) (Protocol Version 8)
* Chrome 15 (Stable) (Protocol Version 8)
* Chrome 16 (Beta) (Protocol Version 13)

***Safari is not supported at this time as it uses an old draft of WebSockets***

*WARNING: This is a library implementing only the most recent draft of the WebSocket protocol.  It will not work with most production browsers until new versions are released that support it.*

I made a decision early on to explicitly avoid maintaining multiple slightly different copies of the same code just to support the browsers currently in the wild.  The major browsers that support WebSocket are on a rapid-release schedule (with the exception of Safari) and once the final version of the protocol is ratified by the IETF, it won't be long before support in the wild stabilizes on that version.  My client application is in Flash/ActionScript 3, so for my purposes I'm not dependent on the browser implementations.  *I made an exception to my stated intention here to support protocol version 13, since only one minor thing changed and it was trivial to handle conditionally.*  The library now interoperates with other clients and servers implementing drafts -08 through -17.

***If you need to simultaneously support older production browser versions that had implemented draft-75/draft-76/draft-00, take a look here: https://gist.github.com/1219165***

**Note about FireFox:  Firefox uses a prefixed constructor name in its client side JavaScript, MozWebSocket(), which will be changed to WebSocket() presumably when the WebSocket RFC has been released.**

For a WebSocket protocol 8 (draft-10) client written in ActionScript 3 see my [AS3WebScocket](https://github.com/Worlize/AS3WebSocket) project.

Overview
--------
This code is relatively new, though it is used in production on http://worlize.com and seems to be stable.  Your mileage may vary.

This is a pure JavaScript implementation of the WebSocket protocol versions 8 and 13 for Node.  There are some example client and server applications that implement various interoperability testing protocols in the "test" folder.

***Note about Draft Naming and versioning:*** *The draft number (draft-17) does not necessarily correspond to the protocol version (13.)  Many times a new draft is released with only editorial changes, in which case the protocol version is not incremented.  The drafts are interoperable within a protocol version, with only editorial changes.  The current implementation of WebSocket-Node works protocol version 8 (drafts -08 through -12) and protocol version 13 (drafts -13 through -17.)*

If you're looking for a version supporting draft-07 or draft-06, see the draft-07 or draft-06 branches.  Previous draft branches will not be maintained, as I plan to track each subsequent draft of the protocol until it's finalized, and will ultimately be supporting *only* the final draft.

**Supported with the following node versions:**
- 0.4.12
- 0.6.2

It may work in earlier or later versions but I'm not actively testing it outside of the listed versions.  YMMV.

Documentation
=============

For more complete documentation, see the [Documentation Wiki](https://github.com/Worlize/WebSocket-Node/wiki/Documentation).

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
- Licensed under the Apache License, Version 2.0
- Protocol version "8" and "13" (Draft-08 through Draft-17) framing and handshake
- Can handle/aggregate received fragmented messages
- Can fragment outgoing messages
- Router to mount multiple applications to various path and protocol combinations
- TLS supported for outbound connections via WebSocketClient
- Cookie setting and parsing
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
- Haven't tested TLS for the Server.  (Perhaps this is handled automatically by attaching the WebSocket server to a https.createServer instead of http.createServer?)


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
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
        autoAcceptConnections: false
    });

    wsServer.on('request', function(request) {
        if (!originIsAllowed(request.origin)) {
          // Make sure we only accept requests from an allowed origin
          request.reject();
          console.log((new Date()) + " Connection from origin " + request.origin + " rejected.");
          return;
        }
        
        var connection = request.accept(null, request.origin);
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
        connection.on('close', function(reasonCode, description) {
            console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
        });
    });
    
    function originIsAllowed(origin) {
      // put logic here to detect whether the specified origin is allowed.
      return true;
    }

Client Example
--------------

This is a simple example client that will print out any utf-8 messages it receives on the console, and periodically sends a random number.

*This code demonstrates a client in Node.js, not in the browser*

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


Resources
---------

A presentation on the state of the WebSockets protocol that I gave on July 23, 2011 at the LA Hacker News meetup.  [WebSockets: The Real-Time Web, Delivered](http://www.scribd.com/doc/60898569/WebSockets-The-Real-Time-Web-Delivered)