WebSocketFrame
==============

* [Constructor](#constructor)
* [Properties](#properties)

`var WebSocketFrame = require('websocket').frame`

This object represents the low level individual frame and is used to drive how the bytes are serialized onto the wire.

Constructor
-----------
```javascript
new WebSocketFrame();
```

Properties
----------

### fin
*Boolean*

Indicates that this is either the only frame in a message, or the last frame in a fragmentation sequence.

### rsv1
*Boolean*

Represents the RSV1 field in the framing, which is currently not used.  Setting this to true will result in a Protocol Error on the receiving peer.

### rsv2
*Boolean*

Represents the RSV2 field in the framing, which is currently not used.  Setting this to true will result in a Protocol Error on the receiving peer.

### rsv3
*Boolean*

Represents the RSV3 field in the framing, which is currently not used.  Setting this to true will result in a Protocol Error on the receiving peer.

### mask
*uint*

Whether or not this frame is (or should be) masked.  For outgoing frames, when connected as a client, this flag is automatically forced to `true` by WebSocketConnection.  Outgoing frames sent from the server-side of a connection are not masked.

### opcode
*uint*

Identifies which kind of frame this is.  List of Opcodes:

    Hex  - Dec - Description
    0x00 -   0 - Continuation
    0x01 -   1 - Text Frame
    0x02 -   2 - Binary Frame
    0x08 -   8 - Close Frame
    0x09 -   9 - Ping Frame
    0x0A -  10 - Pong Frame

### length
*Read-only, uint*

Identifies the length of the payload data on a received frame.  When sending a frame, the length will be automatically calculated from the `binaryPayload` object.

### binaryPayload
*Buffer object*

The binary payload data.  **NOTE**: Even text frames are sent with a Buffer providing the binary payload data.  When sending a UTF-8 Text Frame, you must serialize your string into a Buffer object before constructing your frame, and when receiving a UTF-8 Text Frame, you must deserialize the string from the provided Buffer object.  Do not read UTF-8 data from fragmented Text Frames, as it may have fragmented the data in the middle of a UTF-8 encoded character.  You should buffer all fragments of a text message before attempting to decode the UTF-8 data.
