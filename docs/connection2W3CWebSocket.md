connection2w3cwebsocket
============

* [Usage](#usage)
* [Limitations](#limitations)

`var connToW3C = require('websocket').connection2w3cwebsocket`

Casting a WebSocketConnection into an Implementation of the [W3C WebSocket API](http://www.w3.org/TR/websockets/) for browsers.

The exposed function lets the developer use the browser *W3C WebSocket API* with a serverside websocket connection:

```javascript
var connToW3C = require('websocket').connection2w3cwebsocket

server.on("request", function(request){
  const connection = request.accept();
  const wc3 = connToW3C(connection);
  w3c.onmessage = function(event){ console.log(event.data) };
  w3c.send("hello world");
});
```


Usage
-----------

```javascript
connection2w3cwebsocket(connection)
```

**connection** is a [WebSocketConnection](./WebSocketConnection.md)

Limitations
-----------

* This resulting W3CWebSocket does not fire an open event

The same as the [W3CWebSocket client](./W3CWebSocket.md)

* `bufferedAmount` attribute is always 0.
* `binaryType` is "arraybuffer" by default given that "blob" is not supported (Node does not implement the `Blob` class).
* `send()` method allows arguments of type `DOMString`, `ArrayBuffer`, `ArrayBufferView` (`Int8Array`, etc) or Node `Buffer`, but does not allow `Blob`.
