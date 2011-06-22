var extend = require('./utils').extend;
var crypto = require('crypto');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketFrame = require('./WebSocketFrame');
var BufferList = require('../vendor/FastBufferList');

const STATE_OPEN = "open";
const STATE_CLOSING = "closing";
const STATE_CLOSED = "closed";

function WebSocketConnection(socket, extensions, protocol, maskOutgoingPackets, config) {
    this.config = config;
    this.socket = socket;
    this.protocol = protocol;
    this.extensions = extensions;
    this.remoteAddress = socket.remoteAddress;
    
    // We have to mask outgoing packets if we're acting as a WebSocket client.
    this.maskOutgoingPackets = maskOutgoingPackets;
    
    // We re-use the same buffers for the mask and frame header for all frames
    // received on each connection to avoid a small memory allocation for each
    // frame.
    this.maskBytes = new Buffer(4);
    this.frameHeader = new Buffer(10);
    
    // the BufferList will handle the data streaming in
    this.bufferList = new BufferList();
    
    // Prepare for receiving first frame
    this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    this.fragmentationOpcode = 0;
    this.fragmentationSize = 0; // data received so far...
    this.frameQueue = [];
    
    // Various bits of connection state
    this.connected = true;
    this.state = STATE_OPEN;
    this.waitingForCloseResponse = false;
    
    this.closeTimeout = this.config.closeTimeout;
    this.assembleFragments = this.config.assembleFragments;
    this.maxReceivedMessageSize = this.config.maxReceivedMessageSize;

    // The HTTP Client seems to subscribe to socket error events
    // and re-dispatch them in such a way that doesn't make sense
    // for users of our client, so we want to make sure nobody
    // else is listening for error events on the socket besides us.
    this.socket.removeAllListeners('error');

    this.socket.on('error', this.handleSocketError.bind(this));
    this.socket.on('data', this.handleSocketData.bind(this));
    this.socket.on('end', this.handleSocketEnd.bind(this));
    this.socket.on('close', this.handleSocketClose.bind(this));
    
    this._closeTimerHandler = this.handleCloseTimer.bind(this);
    
    if (this.config.keepalive) {
        this._pingIntervalID = setInterval(this.ping.bind(this), this.config.keepaliveInterval);
    }
};

WebSocketConnection.CLOSE_REASON_NORMAL = 1000;
WebSocketConnection.CLOSE_REASON_GOING_AWAY = 1001;
WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR = 1002;
WebSocketConnection.CLOSE_REASON_UNPROCESSABLE_INPUT = 1003;
WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_LARGE = 1004;
WebSocketConnection.CLOSE_REASON_NOT_PROVIDED = 1005; // Reserved value, not to be used
WebSocketConnection.CLOSE_REASON_ABNORMAL = 1006; // Reserved value, not to be used

util.inherits(WebSocketConnection, EventEmitter);

extend(WebSocketConnection.prototype, {
    handleSocketData: function(data) {
        this.bufferList.write(data);
        
        // currentFrame.addData returns true if all data necessary to parse
        // the frame was available.  It returns false if we are waiting for
        // more data to come in on the wire.
        while (this.connected && this.currentFrame.addData(this.bufferList, this.fragmentationOpcode)) {
            
            // Handle possible parsing errors
            if (this.currentFrame.protocolError) {
                // Something bad happened.. get rid of this client.
                this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR, this.currentFrame.dropReason);
                return;
            }
            else if (this.currentFrame.frameTooLarge) {
                this.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_LARGE, this.currentFrame.dropReason);
                return;
            }
            
            if (!this.assembleFragments) {
                this.emit('frame', this.currentFrame);
            }
            this.processFrame(this.currentFrame);
            this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        }
    },
    
    handleSocketError: function(error) {
        // console.log((new Date()) + " - Closing Connection: Socket Error: " + error);
        if (this.listeners('error').length > 0) {
            this.emit('error', error);
        }
        this.socket.end();
    },

    handleSocketEnd: function() {
        this.socket.end();
        this.frameQueue = null;
        this.fragmentationSize = 0;
        this.bufferList = null;
    },

    handleSocketClose: function(hadError) {
        this.socketHadError = hadError;
        this.connected = false;
        this.state = "closed";
        if (!this.closeEventEmitted) {
            this.closeEventEmitted = true;
            this.emit('close', this);
        }
        if (this.config.keepalive) {
            clearInterval(this._pingIntervalID);
        }
    },
    
    close: function() {
        if (this.connected) {
            this.setCloseTimer();
            this.sendCloseFrame();
            this.state = "closing";
            this.connected = false;
        }
    },
    
    drop: function(closeReason, reasonText) {
        if (typeof(closeReason) !== 'number') {
            closeReason = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
        }
        var logText = "WebSocket: Dropping Connection. Code: " + closeReason.toString(10);
        if (reasonText) {
            logText += (" - " + reasonText);
        }
        console.error((new Date()) + " " + logText);
        this.sendCloseFrame(closeReason, reasonText);
        this.connected = false;
        this.state = "closed";
        this.socket.destroy();
    },
    
    setCloseTimer: function() {
        this.clearCloseTimer();
        this.waitingForCloseResponse = true;
        this.closeTimer = setTimeout(this._closeTimerHandler, this.closeTimeout);
    },
    
    clearCloseTimer: function() {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.waitingForCloseResponse = false;
            this.closeTimer = null;
        }
    },
    
    handleCloseTimer: function() {
        this.closeTimer = null;
        if (this.waitingForCloseResponse) {
            this.waitingForCloseResponse = false;
            this.socket.end();
        }
    },
    
    processFrame: function(frame) {
        var i;
        var message;
        
        switch(frame.opcode) {
            case 0x02: // WebSocketFrame.BINARY_FRAME
                if (frame.fin) {
                    // Complete single-frame message received
                    this.emit('message', {
                        type: 'binary',
                        binaryData: frame.binaryPayload
                    });
                }
                else if (this.frameQueue.length === 0) {
                    if (this.assembleFragments) {
                        // beginning of a fragmented message
                        this.frameQueue.push(frame);
                        this.fragmentationOpcode = frame.opcode;
                        this.fragmentationSize = frame.length;
                    }
                }
                else {
                    this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                              "Illegal BINARY_FRAME received in the middle of a fragmented message.  Expected a continuation or control frame.");
                    return;
                }
                break;
            case 0x01: // WebSocketFrame.TEXT_FRAME
                if (frame.fin) {
                    // Complete single-frame message received
                    this.emit('message', {
                        type: 'utf8',
                        utf8Data: frame.binaryPayload.toString('utf8')
                    });
                }
                else if (this.frameQueue.length === 0) {
                    if (this.assembleFragments) {
                        // beginning of a fragmented message
                        this.frameQueue.push(frame);
                        this.fragmentationOpcode = frame.opcode;
                        this.fragmentationSize = frame.length;
                    }
                }
                else {
                    this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                              "Illegal TEXT_FRAME received in the middle of a fragmented message.  Expected a continuation or control frame.");
                    return;
                }
                break;
            case 0x00: // WebSocketFrame.CONTINUATION
                if (!this.assembleFragments) {
                    return;
                }
                this.frameQueue.push(frame);
                this.fragmentationSize += frame.length;
                if (this.fragmentationSize > this.maxReceivedMessageSize) {
                    this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                              "Maximum message size exceeded.");
                    this.frameQueue = [];
                    this.fragmentationSize = 0;
                    return;
                }
                
                if (frame.fin) {
                    // end of fragmented message, so we process the whole
                    // message now.  We also have to decode the utf-8 data
                    // for text frames after combining all the fragments.
                    var bytesCopied = 0;
                    var binaryPayload = new Buffer(this.fragmentationSize);
                    this.frameQueue.forEach(function (currentFrame) {
                        currentFrame.binaryPayload.copy(binaryPayload, bytesCopied);
                        bytesCopied += currentFrame.binaryPayload.length;
                    });
                    
                    switch (this.frameQueue[0].opcode) {
                        case 0x02: // WebSocketOpcode.BINARY_FRAME
                            this.emit('message', {
                                type: 'binary',
                                binaryData: binaryPayload
                            });
                            break;
                        case 0x01: // WebSocketOpcode.TEXT_FRAME
                            this.emit('message', {
                                type: 'utf8',
                                utf8Data: binaryPayload.toString('utf8')
                            });
                            break;
                        default:
                            this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                                      "Unexpected first opcode in fragmentation sequence: 0x" + this.frameQueue[0].opcode.toString(16));
                            return;
                    }
                    
                    this.frameQueue = [];
                    this.fragmentationSize = 0;
                }
                break;
            case 0x09: // WebSocketFrame.PING
                this.pong(frame.binaryPayload);
                break;
            case 0x0A: // WebSocketFrame.PONG
                break;
            case 0x08: // WebSocketFrame.CONNECTION_CLOSE
                if (this.waitingForCloseResponse) {
                    // Got response to our request to close the connection.
                    // Close is complete, so we just hang up.
                    this.clearCloseTimer();
                    this.waitingForCloseResponse = false;
                    this.state = "closed";
                    this.socket.end();
                }
                else {
                    // Got request from other party to close connection.
                    // Send back acknowledgement and then hang up.
                    this.state = "closing";
                    if (frame.closeStatus !== WebSocketConnection.CLOSE_REASON_NORMAL) {
                        var logCloseError;
                        switch(frame.closeStatus) {
                            case WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR:
                                logCloseError = "Remote peer closed connection: Protocol Error";
                                break;
                            case WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_LARGE:
                                logCloseError = "Remote peer closed connection: Received Message Too Large";
                                break;
                            case WebSocketConnection.CLOSE_REASON_UNPROCESSABLE_INPUT:
                                logCloseError = "Remote peer closed connection: Unprocessable Input";
                                break;
                            case WebSocketConnection.CLOSE_REASON_GOING_AWAY:
                                logCloseError = "Remote peer closed connection: Going Away";
                                break;
                            default:
                                logCloseError = "Remote peer closed connection: Status code " + frame.closeStatus.toString(10);
                                break;
                        }
                        if (frame.binaryPayload) {
                            logCloseError += (" - Description Provided: " + frame.binaryPayload.toString('utf8'));
                        }
                        console.error((new Date()) + " " + logCloseError);
                    }
                    this.sendCloseFrame(WebSocketConnection.CLOSE_REASON_NORMAL);
                    this.socket.end();
                }
                break;
            default:
                this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                          "Unrecognized Opcode: 0x" + frame.opcode.toString(16));
                break;
        }
    },
    
    sendUTF: function(data) {
        data = new Buffer(data);
        var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        frame.opcode = 0x01; // WebSocketOpcode.TEXT_FRAME
        frame.binaryPayload = new Buffer(data, 'utf8');
        this.fragmentAndSend(frame);
    },
    
    sendBytes: function(data) {
        var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        frame.opcode = 0x02; // WebSocketOpcode.BINARY_FRAME
        frame.binaryPayload = data;
        this.fragmentAndSend(frame);
    },
    
    ping: function() {
        var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        frame.opcode = 0x09; // WebSocketOpcode.PING
        frame.fin = true;
        this.sendFrame(frame);
    },
    
    // Pong frames have to echo back the contents of the data portion of the
    // ping frame exactly, byte for byte.
    pong: function(binaryPayload) {
        var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        frame.opcode = 0x0A; // WebSocketOpcode.PONG
        frame.binaryPayload = binaryPayload;
        frame.fin = true;
        this.sendFrame(frame);
    },
    
    fragmentAndSend: function(frame) {
        if (frame.opcode > 0x07) {
            throw new Error("You cannot fragment control frames.");
        }
        
        var threshold = this.config.fragmentationThreshold;
        var length = frame.binaryPayload.length;
        
        if (this.config.fragmentOutgoingMessages && frame.binaryPayload && length > threshold) {
            var numFragments = Math.ceil(length / threshold);
            for (var i=1; i <= numFragments; i++) {
                var currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
                
                // continuation opcode except for first frame.
                currentFrame.opcode = (i === 1) ? frame.opcode : 0x00;
                
                // fin set on last frame only
                currentFrame.fin = (i === numFragments);
                
                // length is likely to be shorter on the last fragment
                var currentLength = (i === numFragments) ? length - (threshold * (i-1)) : threshold;
                var sliceStart = threshold * (i-1);
                
                // Slice the right portion of the original payload
                currentFrame.binaryPayload = frame.binaryPayload.slice(sliceStart, sliceStart + currentLength);
                
                this.sendFrame(currentFrame);
            }
        }
        else {
            frame.fin = true;
            this.sendFrame(frame);
        }
    },
    
    sendCloseFrame: function(reasonCode, reasonText) {
        var reasonLength = 0;
        if (typeof(reasonCode) !== 'number') {
            reasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
        }
        if (typeof(reasonText) === 'string') {
            reasonLength = Buffer.byteLength(reasonText, 'utf8');
        }
        var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
        frame.fin = true;
        frame.opcode = 0x08; // WebSocketOpcode.CONNECTION_CLOSE
        frame.closeStatus = reasonCode;
        if (reasonText) {
            frame.binaryPayload = new Buffer(reasonText, 'utf8');
        }
        
        this.sendFrame(frame);
    },
    
    sendFrame: function(frame) {
        frame.mask = this.maskOutgoingPackets;
        if (this.connected && this.socket.writable) {
            this.socket.write(frame.toBuffer());
        }
    }
});

module.exports = WebSocketConnection;