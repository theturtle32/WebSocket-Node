WebSocketClient
===============

* [Constructor](#constructor)
* [Config Options](#client-config-options)
* [Methods](#methods)
* [Events](#events)
* **Examples**
  * [Connect using a Proxy Server](#connect-using-a-proxy-server)

`var WebSocketClient = require('websocket').client`

This object allows you to make client connections to a WebSocket server.

Constructor
-----------
```javascript
new WebSocketClient([clientConfig]);
```

Client Config Options
---------------------
**webSocketVersion** - uint - *Default: 13*
Which version of the WebSocket protocol to use when making the connection.  Currently supported values are 8 and 13.
This option will be removed once the protocol is finalized by the IETF It is only available to ease the transition through the intermediate draft protocol versions. The only thing this affects the name of the Origin header.

**maxReceivedFrameSize** - uint - *Default: 1MiB*  
The maximum allowed received frame size in bytes.  Single frame messages will also be limited to this maximum.

**maxReceivedMessageSize** - uint - *Default: 8MiB*  
The maximum allowed aggregate message size (for fragmented messages) in bytes.
            
**fragmentOutgoingMessages** - Boolean - *Default: true*  
Whether or not to fragment outgoing messages.  If true, messages will be automatically fragmented into chunks of up to `fragmentationThreshold` bytes.
            
**fragmentationThreshold** - uint - *Default: 16KiB*  
The maximum size of a frame in bytes before it is automatically fragmented.

**assembleFragments** - boolean - *Default: true*  
If true, fragmented messages will be automatically assembled and the full message will be emitted via a `message` event. If false, each frame will be emitted on the WebSocketConnection object via a `frame` event and the application will be responsible for aggregating multiple fragmented frames.  Single-frame messages will emit a `message` event in addition to the `frame` event. Most users will want to leave this set to `true`.

**closeTimeout** - uint - *Default: 5000*  
The number of milliseconds to wait after sending a close frame for an acknowledgement to come back before giving up and just closing the socket.

**tlsOptions** - object - *Default: {}*  
Options to pass to https.connect if connecting via TLS


Methods
-------
###connect(requestUrl, requestedProtocols, [[[origin], headers], requestOptions])

Will establish a connection to the given `requestUrl`.  `requestedProtocols` indicates a list of multiple subprotocols supported by the client.  The remote server will select the best subprotocol that it supports and send that back when establishing the connection.  `origin` is an optional field that can be used in user-agent scenarios to identify the page containing any scripting content that caused the connection to be requested.  (This seems unlikely in node.. probably should leave it null most of the time.)  `requestUrl` should be a standard websocket url, such as:
`ws://www.mygreatapp.com:1234/websocketapp/`

`headers` should be either `null` or an object specifying additional arbitrary HTTP request headers to send along with the request.  This may be used to pass things like access tokens, etc. so that the server can verify authentication/authorization before deciding to accept and open the full WebSocket connection.

`requestOptions` should be either `null` or an object specifying additional configuration options to be passed to `http.request` or `https.request`.  This can be used to pass a custom `agent` to enable `WebSocketClient` usage from behind an HTTP or HTTPS proxy server using [koichik/node-tunnel](https://github.com/koichik/node-tunnel) or similar.

`origin` must be specified if you want to pass `headers`, and both `origin` and `headers` must be specified if you want to pass `requestOptions`.  The `origin` and `headers` parameters may be passed as `null`.


Events
------
###connect
`function(webSocketConnection)`

Emitted upon successfully negotiating the WebSocket handshake with the remote server.  `webSocketConnection` is an instance of `WebSocketConnection` that can be used to send and receive messages with the remote server.

###connectFailed
`function(errorDescription)`

Emitted when there is an error connecting to the remote host or the handshake response sent by the server is invalid.

###httpResponse
`function(response, webSocketClient)`

Emitted when the server replies with anything other then "101 Switching Protocols".  Provides an opportunity to handle redirects for example. The `response` parameter is an instance of the [http.IncomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage) class.  This is not suitable for handling receiving of large response bodies, as the underlying socket will be immediately closed by WebSocket-Node as soon as all handlers for this event are executed.

Normally, if the remote server sends an HTTP response with a response code other than 101, the `WebSocketClient` will automatically emit the `connectFailed` event with a description of what was received from the remote server.  However, if there are one or more listeners attached to the `httpResponse` event, then the `connectFailed` event will not be emitted for non-101 responses received.  `connectFailed` will still be emitted for non-HTTP errors, such as when the remote server is unreachable or not accepting TCP connections.


Examples
========

Connect using a Proxy Server
----------------------------

Using [koichik/node-tunnel](https://github.com/koichik/node-tunnel):

```javascript
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();
var tunnel = require('tunnel');

var tunnelingAgent = tunnel.httpOverHttp({
  proxy: {
    host: 'proxy.host.com',
    port: 8080
  }
});

var requestOptions = {
    agent: tunnelingAgent
};

client.connect('ws://echo.websocket.org/', null, null, null, requestOptions);
```
