W3CWebSocket
============

* [Constructor](#constructor)
* [Limitations](#limitations)

`var W3CWebSocket = require('websocket').w3cwebsocket`

Implementation of the [W3C WebSocket API](http://www.w3.org/TR/websockets/) for browsers.

The exposed class lets the developer use the browser WebSocket API in Node.


Constructor
-----------

```javascript
new WebSocket(requestUrl, requestedProtocols, [[[[origin], headers], requestOptions], clientConfig])
```

**clientConfig** is the parameter of the [WebSocketClient](./WebSocketClient.md) constructor.

**requestUrl**, **requestedProtocols**, **origin**, **headers** and **requestOptions** are parameters to be used in the `connect()` method of [WebSocketClient](./WebSocketClient.md).

This constructor API makes it possible to use the W3C API and "browserify" the Node application into a valid browser library.


Limitations
-----------

* `bufferedAmount` attribute is always 0.
* `binaryType` is "arraybuffer" by default given that "blob" is not supported (Node does not implement the `Blob` class).
* `send()` method allows arguments of type `DOMString`, `ArrayBuffer`, `ArrayBufferView` (`Int8Array`, etc) or Node `Buffer`, but does not allow `Blob`.
