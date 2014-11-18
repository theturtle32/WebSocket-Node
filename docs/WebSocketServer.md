WebSocketServer
===============

* [Constructor](#constructor)
* [Config Options](#server-config-options)
* [Properties](#properties)
* [Methods](#methods)
* [Events](#events)

`var WebSocketServer = require('websocket').server`

Constructor
-----------

```javascript
new WebSocketServer([serverConfig]);
```

Methods
-------

###mount(serverConfig)

`mount` will attach the WebSocketServer instance to a Node http.Server instance. `serverConfig` is required, and is an object with configuration values.  For those values, see **Server Config Options** below.  If you passed `serverConfig` to the constructor, this function will automatically be invoked.

###unmount()

`unmount` will detach the WebSocketServer instance from the Node http.Server instance.  All existing connections are left alone and will not be affected, but no new WebSocket connections will be accepted.

###closeAllConnections()

Will gracefully close all open WebSocket connections.

###shutDown()

Gracefully closes all open WebSocket connections and unmounts the server from the Node http.Server instance.

Server Config Options
---------------------
**httpServer** - (http.Server instance) **Required**.  
The Node http or https server instance(s) to attach to.  You can pass a single instance directly, or pass an array of instances to attach to multiple http/https servers.  Passing an array is particularly useful when you want to accept encrypted and unencrypted WebSocket connections on both ws:// and wss:// protocols using the same WebSocketServer instance.

**maxReceivedFrameSize** - uint - *Default: 64KiB*  
The maximum allowed received frame size in bytes.  Single frame messages will also be limited to this maximum.

**maxReceivedMessageSize** - uint - *Default: 1MiB*  
The maximum allowed aggregate message size (for fragmented messages) in bytes.
            
**fragmentOutgoingMessages** - Boolean - *Default: true*  
Whether or not to fragment outgoing messages.  If true, messages will be automatically fragmented into chunks of up to `fragmentationThreshold` bytes.
            
**fragmentationThreshold** - uint - *Default: 16KiB*  
The maximum size of a frame in bytes before it is automatically fragmented.

**keepalive** - boolean - *Default: true*  
If true, the server will automatically send a ping to all clients every `keepaliveInterval` milliseconds.  Each client has an independent keepalive timer, which is reset when any data is received from that client.

**keepaliveInterval** - uint - *Default: 20000*  
The interval in milliseconds to send keepalive pings to connected clients.

**dropConnectionOnKeepaliveTimeout** - boolean - *Default: true*  
If true, the server will consider any connection that has not received any data within the amount of time specified by `keepaliveGracePeriod` after a keepalive ping has been sent. Ignored if `keepalive` is false.

**keepaliveGracePeriod** - uint - *Default: 10000*  
The amount of time to wait after sending a keepalive ping before closing the connection if the connected peer does not respond. Ignored if `keepalive` or `dropConnectionOnKeepaliveTimeout` are false.  The grace period timer is reset when any data is received from the client.

**assembleFragments** - boolean - *Default: true*  
If true, fragmented messages will be automatically assembled and the full message will be emitted via a `message` event. If false, each frame will be emitted on the WebSocketConnection object via a `frame` event and the application will be responsible for aggregating multiple fragmented frames.  Single-frame messages will emit a `message` event in addition to the `frame` event. Most users will want to leave this set to `true`.

**autoAcceptConnections** - boolean - *Default: false*  
If this is true, websocket connections will be accepted regardless of the path and protocol specified by the client. The protocol accepted will be the first that was requested by the client.  Clients from any origin will be accepted. This should only be used in the simplest of cases.  You should probably leave this set to `false`; and inspect the request object to make sure it's acceptable before accepting it.

**closeTimeout** - uint - *Default: 5000*  
The number of milliseconds to wait after sending a close frame for an acknowledgement to come back before giving up and just closing the socket.

**disableNagleAlgorithm** - boolean - *Default: true*  
The Nagle Algorithm makes more efficient use of network resources by introducing a small delay before sending small packets so that multiple messages can be batched together before going onto the wire.  This however comes at the cost of latency, so the default is to disable it.  If you don't need low latency and are streaming lots of small messages, you can change this to 'false';

**ignoreXForwardedFor** - Boolean - *Default: false*  
Whether or not the `X-Forwarded-For` header should be respected.
It's important to set this to 'true' when accepting connections
from untrusted clients, as a malicious client could spoof its
IP address by simply setting this header.  It's meant to be added
by a trusted proxy or other intermediary within your own
infrastructure.
More info: [X-Forwarded-For on Wikipedia](http://en.wikipedia.org/wiki/X-Forwarded-For)

Events
------
There are three events emitted by a WebSocketServer instance that allow you to handle incoming requests, establish connections, and detect when a connection has been closed.

###request
`function(webSocketRequest)`

If `autoAcceptConnections` is set to `false`, a `request` event will be emitted by the server whenever a new WebSocket request is made.  You should inspect the requested protocols and the user's origin to verify the connection, and then accept or reject it by calling webSocketRequest.accept('chosen-protocol', 'accepted-origin') or webSocketRequest.reject()

###connect
`function(webSocketConnection)`

Emitted whenever a new WebSocket connection is accepted.

###close
`function(webSocketConnection, closeReason, description)`

Whenever a connection is closed for any reason, the WebSocketServer instance will emit a `close` event, passing a reference to the WebSocketConnection instance that was closed.  `closeReason` is the numeric reason status code for the connection closure, and `description` is a textual description of the close reason, if available.
