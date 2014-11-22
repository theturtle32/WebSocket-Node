WebSocketConnection
===================

* [Constructor](#constructor)
* [Properties](#properties)
* [Methods](#methods)
* [Events](#events)

This object provides the interface through which you can communicate with connected peers.  It is used in both WebSocketServer and WebSocketClient situations.

Constructor
-----------
This object is created internally by `WebSocketRequest`.

Properties
----------

###closeDescription

After the connection is closed, contains a textual description of the reason for the connection closure, or `null` if the connection is still open.

###closeReasonCode

After the connection is closed, contains the numeric close reason status code, or `-1` if the connection is still open.

###socket

The underlying net.Socket instance for the connection.

###protocol

The subprotocol that was chosen to be spoken on this connection.  This field will have been converted to lower case.

###extensions

An array of extensions that were negotiated for this connection.  Currently unused, will always be an empty array.

###remoteAddress

The IP address of the remote peer as a string.  In the case of a server, the `X-Forwarded-For` header will be respected and preferred for the purposes of populating this field.  If you need to get to the actual remote IP address, `webSocketConnection.socket.remoteAddress` will provide it.

###webSocketVersion

A number indicating the version of the WebSocket protocol being spoken on this connection.

###connected

A boolean value indicating whether or not the connection is still connected.  *Read-only*

Methods
-------
###close([reasonCode], [description])

Will gracefully close the connection.  A close frame will be sent to the remote peer with the provided `reasonCode` and `description` indicating that we wish to close the connection, and we will then wait for up to `config.closeTimeout` milliseconds for an acknowledgment from the remote peer before terminating the underlying socket connection.  The `closeTimeout` is passed as part of the `serverOptions` or `clientOptions` hashes to either the `WebSocketServer` or `WebSocketClient` constructors.  Most of the time, you should call `close()` without arguments to initiate a normal connection closure.  If you specify a `reasonCode` that is defined as one of the standard codes in the WebSocket protocol specification and do not provide a `description`, the default description for the given code will be used.  If you would prefer not to send a description at all, pass an empty string `''`as the description parameter.

###drop([reasonCode], [description])

Will send a close frame to the remote peer with the provided `reasonCode` and `description` and will immediately close the socket without waiting for a response.  This should generally be used only in error conditions.  The default `reasonCode` is 1002 (Protocol Error).  Close reasons defined by the WebSocket protocol draft include:

```javascript
WebSocketConnection.CLOSE_REASON_NORMAL = 1000;
WebSocketConnection.CLOSE_REASON_GOING_AWAY = 1001;
WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR = 1002;
WebSocketConnection.CLOSE_REASON_UNPROCESSABLE_INPUT = 1003;
WebSocketConnection.CLOSE_REASON_RESERVED = 1004; // Reserved value.  Undefined meaning.
WebSocketConnection.CLOSE_REASON_NOT_PROVIDED = 1005; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_ABNORMAL = 1006; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_INVALID_DATA = 1007;
WebSocketConnection.CLOSE_REASON_POLICY_VIOLATION = 1008;
WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG = 1009;
WebSocketConnection.CLOSE_REASON_EXTENSION_REQUIRED = 1010;
```
###sendUTF(string)

Immediately sends the specified string as a UTF-8 WebSocket message to the remote peer.  If `config.fragmentOutgoingMessages` is `true` the message may be sent as multiple fragments if it exceeds `config.fragmentationThreshold` bytes.  Any object that implements the `toString()` method may be passed to `sendUTF()`

###sendBytes(buffer)

Immediately sends the specified Node `Buffer` object as a Binary WebSocket message to the remote peer.  If `config.fragmentOutgoingMessages` is `true` the message may be sent as multiple fragments if it exceeds `config.fragmentationThreshold` bytes.

###send(data)

A convenience function that will auto-detect the data type and send the appropriate WebSocket message accordingly.  Immediately sends the specified data as either a UTF-8 or Binary message.  If `data` is a Node Buffer, a binary message will be sent.  Otherwise, the object provided must implement the `toString()` method, and the result of calling `toString()` on the `data` object will be sent as a UTF-8 message.

###ping(data)

Sends a ping frame to the remote peer.  `data` can be a Node `Buffer` or any object that implements `toString()`, such as a `string` or `number`.  Ping frames must not exceed 125 bytes in length.

###pong(buffer)

Sends a pong frame to the remote peer.  Pong frames may be sent unsolicited and such pong frames will trigger no action on the receiving peer.  Pong frames sent in response to a ping frame must mirror the payload data of the ping frame exactly.  The `WebSocketConnection` object handles this internally for you, so there should be no need to use this method to respond to pings.  Pong frames must not exceed 125 bytes in length.

###sendFrame(webSocketFrame)

Serializes a `WebSocketFrame` object into binary data and immediately sends it to the remote peer.  This is an advanced function, requiring you to manually compose your own `WebSocketFrame`.  You should probably use `sendUTF` or `sendBytes` instead.

Events
------
###message
`function(message)`

Emitted whenever a complete single-frame message is received, or if `config.assembleFragments` is `true` (the default), it will also be emitted with a complete message assembled from multiple fragmented frames.  This is the primary event to listen for to receive messages from the remote peer.  The `message` object looks like the following:

```javascript
// For Text Frames:
{
    type: "utf8",
    utf8Data: "A string containing the received message."
}

// For Binary Frames:
{
    type: "binary",
    binaryData: binaryDataBuffer // a Buffer object containing the binary message payload
}
```

###frame
`function(webSocketFrame)`

This event is emitted only if `config.assembleFragments` is `false` (default is `true`).  This allows you to handle individual fragments as they are received without waiting on `WebSocketConnection` to buffer them into a single `message` event for you.  This may be desirable if you are working with streaming data, as it is possible to send fragments continually without ever stopping.  `webSocketFrame` is an instance of `WebSocketFrame` which has properties that represent all the individual fields in WebSocket's binary framing protocol.

###close
`function(reasonCode, description)`

This event is emitted when the connection has been fully closed and the socket is no longer connected.  `reasonCode` is the numeric reason code for the connection closure.  `description` is a textual explanation for the connection closure, if available.

###error
`function(error)`

This event is emitted when there has been a socket error.  If this occurs, a `close` event will also be emitted.
