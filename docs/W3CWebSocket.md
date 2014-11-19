W3CWebSocket
============

* [Constructor](#constructor)
* [Limitations](#limitations)

`var W3CWebSocket = require('websocket').w3cwebsocket`

Implementation of the [W3C WebSocket API](http://www.w3.org/TR/websockets/) for browsers.

The exposed class lets the developer use the browser *W3C WebSocket API* in Node:

```javascript
var WS = require('websocket').w3cwebsocket;

WS === window.WebSocket
// => true when in the browser

var ws = new WS('ws://example.com/resource', 'foo', 'http://example.com');
// - In Node it creates an instance of websocket.W3CWebSocket.
// - In the browser it creates an instance of window.WebSocket (third parameter
//   is ignored by the native WebSocket constructor).

ws.onopen = function() { console.log('ws open'); };
// etc.
```


Constructor
-----------

```javascript
new W3CWebSocket(requestUrl, requestedProtocols, [[[[origin], headers], requestOptions], clientConfig])
```

**clientConfig** is the parameter of the [WebSocketClient](./WebSocketClient.md) constructor.

**requestUrl**, **requestedProtocols**, **origin**, **headers** and **requestOptions** are parameters to be used in the `connect()` method of [WebSocketClient](./WebSocketClient.md).

This constructor API makes it possible to use the W3C API and "browserify" the Node application into a valid browser library.

When running in a browser (for example by using [browserify](http://browserify.org/)) the browser's native `WebSocket` implementation is used, and thus just the first and second arguments (`requestUrl` and `requestedProtocols`) are used (those allowed by the *W3C WebSocket API*).


Limitations
-----------

* `bufferedAmount` attribute is always 0.
* `binaryType` is "arraybuffer" by default given that "blob" is not supported (Node does not implement the `Blob` class).
* `send()` method allows arguments of type `DOMString`, `ArrayBuffer`, `ArrayBufferView` (`Int8Array`, etc) or Node `Buffer`, but does not allow `Blob`.
