var extend = require('./utils').extend;
var ctio = require('../vendor/node-ctype/ctio');

const LOAD_MASK_KEY = 0;
const DECODE_HEADER = 1;
const WAITING_FOR_16_BIT_LENGTH = 2;
const WAITING_FOR_64_BIT_LENGTH = 3;
const WAITING_FOR_PAYLOAD = 4;
const COMPLETE = 5;

// WebSocketConnection will pass shared buffer objects for maskBytes and
// frameHeader into the constructor to avoid tons of small memory allocations
// for each frame we have to parse.  This is only used for parsing frames
// we receive off the wire.
function WebSocketFrame(maskBytes, frameHeader, maxFrameSize) {
    this.maskBytes = maskBytes;
    this.frameHeader = frameHeader;
    this.maxFrameSize = maxFrameSize;
    this.protocolError = false;
    this.frameTooLarge = false;
};

extend(WebSocketFrame.prototype, {
    addData: function(bufferList, decodeMask, fragmentationType) {
        var temp;
        if (typeof(this.parseState) === 'undefined') {
            if (decodeMask) {
                this.parseState = LOAD_MASK_KEY;
            }
            else {
                this.parseState = DECODE_HEADER;
            }
        }
        if (this.parseState === LOAD_MASK_KEY) {
            if (bufferList.length >= 4) {
                bufferList.joinInto(this.maskBytes, 0, 0, 4);
                bufferList.advance(4);
                this.maskPos = 0;
                this.parseState = DECODE_HEADER;
            }
        }
        if (this.parseState === DECODE_HEADER) {
            if (bufferList.length >= 2) {
                bufferList.joinInto(this.frameHeader, 0, 0, 2);
                bufferList.advance(2);
                if (decodeMask) {
                    this.applyMask(this.frameHeader, 0, 2);                    
                }
                var firstByte = this.frameHeader[0];
                var secondByte = this.frameHeader[1];

                this.fin     = Boolean(firstByte  & 0x80);
                this.rsv1    = Boolean(firstByte  & 0x40);
                this.rsv2    = Boolean(firstByte  & 0x20);
                this.rsv3    = Boolean(firstByte  & 0x10);
                this.rsv4    = Boolean(secondByte & 0x80);

                this.opcode  = firstByte  & 0x0F;
                this.length = secondByte & 0x7F;
                
                if (this.length === 126) {
                    this.parseState = WAITING_FOR_16_BIT_LENGTH;
                }
                else if (this.length === 127) {
                    this.parseState = WAITING_FOR_64_BIT_LENGTH;
                }
                else {
                    this.parseState = WAITING_FOR_PAYLOAD;
                }
            }
        }
        if (this.parseState === WAITING_FOR_16_BIT_LENGTH) {
            if (bufferList.length >= 2) {
                bufferList.joinInto(this.frameHeader, 2, 0, 2);
                bufferList.advance(2);
                if (decodeMask) {
                    this.applyMask(this.frameHeader, 2, 2);                    
                }
                this.length = ctio.ruint16(this.frameHeader, 'big', 2);
                this.parseState = WAITING_FOR_PAYLOAD;
            }
        }
        else if (this.parseState === WAITING_FOR_64_BIT_LENGTH) {
            if (bufferList.length >= 8) {
                bufferList.joinInto(this.frameHeader, 2, 0, 8);
                bufferList.advance(8);
                if (decodeMask) {
                    this.applyMask(this.frameHeader, 2, 8);
                }
                var lengthPair = ctio.ruint64(this.frameHeader, 'big', 2);
                if (lengthPair[0] !== 0) {
                    this.protocolError = true;
                    this.dropReason = "Unsupported 64-bit length frame received";
                    return true;
                }
                this.length = lengthPair[1];
                this.parseState = WAITING_FOR_PAYLOAD;
            }
        }
        
        if (this.length > this.maxFrameSize) {
            this.frameTooLarge = true;
            this.dropReason = "Frame size of " + this.length.toString(10) +
                              " bytes exceeds server maximum accepted frame size of " +
                              this.maxFrameSize.toString(10) + " bytes.";
            return true;
        }
        
        if (this.parseState === WAITING_FOR_PAYLOAD) {
            if (this.opcode === 0x04 && this.fin) { // Normal Text Frame
                if (bufferList.length >= this.length) {
                    temp = bufferList.take(this.length);
                    bufferList.advance(this.length);
                    if (decodeMask) {
                        this.applyMask(temp, 0, this.length);
                    }
                    this.utf8Payload = temp.toString('utf8');
                    this.parseState = COMPLETE;
                    return true;
                }
            }
            // If the frame has a CONTINUATION opcode, we have to use
            // the opcode from the first fragmented frame.  Only text
            // and binary frames can be fragmented.
            // We read fragmented text messages as binary because the
            // fragmentation boundary may occur in the middle of a
            // utf-8 character.  We'll decode the utf-8 data when all
            // is said and done.
            else if ((this.opcode === 0x00 && (fragmentationType === 0x05 || fragmentationType === 0x04)) || // Continuation
                     (this.opcode === 0x05 && this.fin)) // Normal Binary Frame
            {
                if (bufferList.length >= this.length) {
                    this.binaryPayload = bufferList.take(this.length);
                    bufferList.advance(this.length);
                    if (decodeMask) {
                        this.applyMask(this.binaryPayload, 0, this.length);
                    }
                    this.parseState = COMPLETE;
                    return true;
                }
            }
            else {
                switch (this.opcode) {
                    case 0x00: // WebSocketOpcode.CONTINUATION
                        // Unhandled continuation frame
                        this.protocolError = true;
                        this.dropReason = "Received unexpected continuation frame.";
                        return true;

                    case 0x02: // WebSocketOpcode.PING
                        return this.throwAwayPayload(bufferList);
                    
                    case 0x03: // WebSocketOpcode.PONG
                        return this.throwAwayPayload(bufferList);
                    
                    case 0x01: //WebSocketOpcode.CONNECTION_CLOSE
                        if (bufferList.length >= this.length) {
                            this.binaryPayload = bufferList.take(this.length);
                            bufferList.advance(this.length);
                            if (decodeMask) {
                                this.applyMask(this.binaryPayload, 0, this.length);
                            }
                            this.closeStatus = ctio.ruint16(this.binaryPayload, 'big', 0);
                            if (this.length > 2) {
                                this.utf8Payload = this.binaryPayload.toString('utf8', 2);
                            }
                            this.parseState = COMPLETE;
                            return true;
                        }
                        break;
                    default:
                        // unknown frame opcode type... close connection.
                        this.protocolError = true;
                        this.dropReason = "Unknown opcode: 0x" + this.opcode.toString(16);
                        return true;
                }
            }
        }
        return false;
    },
    throwAwayPayload: function(bufferList) {
        if (bufferList.length >= this.length) {
            bufferList.advance(this.length);
            this.parseState = COMPLETE;
            return true;
        }
        return false;
    },
    applyMask: function(buffer, offset, length) {
        var end = offset + length;
        for (var i=offset; i < end; i++) {
            buffer[i] = buffer[i] ^ this.maskBytes[this.maskPos];
            this.maskPos = (this.maskPos + 1) & 3;
        }
    },
    toBuffer: function(maskContents, nullMask) {
        var maskKey;
        var headerLength = 2;
        var data;
        var outputPos = 0;
        var firstByte = 0x00;
        var secondByte = 0x00;
        
        if (maskContents) {
            if (!nullMask) {
                // Generate a mask key
                maskKey = Math.ceil(Math.random()*0xFFFFFFFF);
            }
            else {
                maskKey = 0x00000000;
            }
            ctio.wuint32(maskKey, this.maskBytes, 'big', 0);
        }
        
        if (this.fin) {
            firstByte |= 0x80;
        }
        if (this.rsv1) {
            firstByte |= 0x40;
        }
        if (this.rsv2) {
            firstByte |= 0x20;
        }
        if (this.rsv3) {
            firstByte |= 0x10;
        }
        if (this.rsv4) {
            secondByte |= 0x80;
        }

        firstByte |= (this.opcode & 0x0F);

        if (this.opcode === 0x05) { // WebSocketOpcode.BINARY_FRAME
            data = this.binaryPayload;
            if (!(data instanceof Buffer)) {
                throw new Error("Binary payload must be a Buffer instance");
            }
            this.length = data.length;
        }
        else if (this.opcode === 0x01) { // WebSocketOpcode.CONNECTION_CLOSE
            this.length = 2;
            if (this.utf8Payload) {
                this.length += Buffer.byteLength(this.utf8Payload, 'utf8');
            }
            data = new Buffer(this.length);
            ctio.wuint16(this.closeStatus, 'big', data, 0);
            if (this.utf8Payload) {
                data.write(this.utf8Payload, 2, 'utf8');
            }
        }
        else if (this.utf8Payload) { // text, ping, and pong frames
            // According to the spec, ping and pong frames
            // can optionally carry a payload.
            data = new Buffer(this.utf8Payload, 'utf8');
            this.length = data.length;
            data.write(this.utf8Payload, 0, 'utf8');
        }
        else {
            this.length = 0;
        }

        if (this.length <= 125) {
            // encode the length directly into the two-byte frame header
            secondByte |= (this.length & 0x7F);
        }
        else if (this.length > 125 && this.length <= 0xFFFF) {
            // Use 16-bit length
            secondByte |= 126;
            headerLength += 2;
        }
        else if (this.length > 0xFFFF) {
            // Use 64-bit length
            secondByte |= 127;
            headerLength += 8;
        }

        output = new Buffer(this.length + headerLength + (maskContents ? 4 : 0));

        if (maskContents) {
            // write the mask key
            this.maskBytes.copy(ouptut, 0, 0, 4);
            outputPos += 4;
        }
        
        // write the frame header
        output[outputPos++] = firstByte;
        output[outputPos++] = secondByte;

        if (this.length > 125 && this.length <= 0xFFFF) {
            // write 16-bit length
            ctio.wuint16(this.length, 'big', output, outputPos);
            outputPos += 2;
        }
        else if (this.length > 0xFFFF) {
            // write 64-bit length
            ctio.wuint64([0x00000000, this.length], 'big', output, outputPos);
            outputPos += 8;
        }
        
        if (this.length > 0) {
            data.copy(output, outputPos);
        }
        
        if (maskContents) {
            this.applyMask(output, 4, output.length - 4);
        }

        return output;
    }
});


module.exports = WebSocketFrame;