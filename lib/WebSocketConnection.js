var extend = require('./utils').extend;
var crypto = require('crypto');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketFrame = require('./WebSocketFrame');
var WebSocketMessage = require('./WebSocketMessage');
var BufferList = require('./FastBufferList');

function WebSocketConnection(socket, extensions, protocol) {
    this.socket = socket;
    this.protocol = protocol;
    this.extensions = extensions;
    this.remoteAddress = socket.remoteAddress;
    
    // the BufferList will handle the data streaming in
    this.bufferList = new BufferList();
    
    // Prepare for receiving first frame
    this.currentFrame = new WebSocketFrame();
    this.fragmentationOpcode = 0;
    this.frameQueue = [];

    socket.on('data', this.handleSocketData.bind(this));
    socket.on('end', this.handleSocketEnd.bind(this));
    socket.on('error', this.handleSocketError.bind(this));
    socket.on('close', this.handleSocketClose.bind(this));
};

util.inherits(WebSocketConnection, EventEmitter);

extend(WebSocketConnection.prototype, {
    handleSocketData: function(data) {
        this.bufferList.write(data);
        while (this.currentFrame.addData(this.bufferList, true, this.fragmentationOpcode)) {
            this.processFrame(this.currentFrame);
            this.currentFrame = new WebSocketFrame();
        }
    },

    handleSocketEnd: function() {
        
    },

    handleSocketError: function() {
        
    },

    handleSocketClose: function(hadError) {
        
    },
    
    processFrame: function(frame) {
        var i;
        var currentFrame;
        var message;
        
        switch(frame.opcode) {
            case 0x05: // WebSocketFrame.BINARY_FRAME
    			if (frame.fin) {
    				message = new WebSocketMessage();
    				message.type = 'binary';
    				message.binaryData = frame.binaryPayload;
                    this.emit('message', message);
    			}
    			else if (this.frameQueue.length === 0) {
    				// beginning of a fragmented message
    				this.frameQueue.push(frame);
    				this.fragmentationOpcode = frame.opcode;
    			}
    			else {
    			    // TODO: Less destructive error handling.
    				throw new Error("Illegal BINARY_FRAME received in the middle of a fragmented message.  Expected a continuation or control frame.");
    			}
                break;
            case 0x04: // WebSocketFrame.TEXT_FRAME
                if (frame.fin) {
					message = new WebSocketMessage();
					message.type = 'utf8';
					message.utf8Data = frame.utf8Payload;
                    this.emit('message', message);
				}
				else if (this.frameQueue.length === 0) {
					// beginning of a fragmented message
					this.frameQueue.push(frame);
					this.fragmentationOpcode = frame.opcode;
				}
				else {
				    // TODO: Less destructive error handling.
					throw new Error("Illegal TEXT_FRAME received in the middle of a fragmented message.  Expected a continuation or control frame.");
				}
				break;
            case 0x00: // WebSocketFrame.CONTINUATION
                this.frameQueue.push(frame);
				if (frame.fin) {
					// end of fragmented message, so we process the whole
					// message now
					message = new WebSocketMessage();
					var messageOpcode = this.frameQueue[0].opcode;
					switch (messageOpcode) {
						case 0x05: // WebSocketOpcode.BINARY_FRAME
							message.type = 'binary';
							var totalLength = 0;
							this.frameQueue.forEach(function (currentFrame) {
							    totalLength += currentFrame.binaryData.length;
							});
							message.binaryData = new Buffer(totalLength);
							this.frameQueue.forEach(function (currentFrame) {
							    currentFrame.binaryData.copy(message.binaryData, message.binaryData.length);
							});
							break;
						case WebSocketOpcode.TEXT_FRAME:
							message.type = 'utf8';
							message.utf8Data = "";
							this.frameQueue.forEach(function (currentFrame) {
								message.utf8Data += currentFrame.utf8Payload;
							});
							break;
					}
					frameQueue = [];
					fragmentationOpcode = 0;
					this.emit('message', message);
				}
				break;
            case 0x02: // WebSocketFrame.PING
                this.pong();
                break;
            case 0x03: // WebSocketFrame.PONG
                break;
            case 0x01: // WebSocketFrame.CONNECTION_CLOSE
                // TODO: Handle connection closing
                break;
            default:
                // TODO: Less destructive error handling.
                throw new Error("Unrecognized Opcode");
                break;
        }
    },
    
    sendUTF: function(data) {
        if (this.socket.writable) {
            var frame = new WebSocketFrame();
            frame.fin = true;
            frame.opcode = 0x04; // WebSocketOpcode.TEXT_FRAME
            frame.utf8Payload = data;
            this.socket.write(frame.toBuffer());
        }
    },
    
    sendBytes: function(data) {
        if (this.socket.writable) {
            var frame = new WebSocketFrame();
            frame.fin = true;
            frame.opcode = 0x05; // WebSocketOpcode.BINARY_FRAME
            frame.binaryPayload = data;
            this.socket.write(frame.toBuffer());
        }
    },
    
    ping: function() {
        if (this.socket.writable) {
            var frame = new WebSocketFrame();
            frame.fin = true;
            frame.opcode = 0x02; // WebSocketOpcode.PING
            this.socket.write(frame.toBuffer());
        }
    },
    
    pong: function() {
        if (this.socket.writable) {
            var frame = new WebSocketFrame();
            frame.fin = true;
            frame.opcode = 0x03; // WebSocketOpcode.PONG
            this.socket.write(frame.toBuffer());
        }
    }
});

module.exports = WebSocketConnection;