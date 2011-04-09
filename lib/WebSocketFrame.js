var extend = require('./utils').extend;
var ctio = require('../vendor/node-ctype/ctio');

const LOAD_MASK_KEY = 0;
const DECODE_HEADER = 1;
const WAITING_FOR_16_BIT_LENGTH = 2;
const WAITING_FOR_64_BIT_LENGTH = 3;
const WAITING_FOR_PAYLOAD = 4;
const COMPLETE = 5;

function WebSocketFrame() {};

extend(WebSocketFrame.prototype, {
    addData: function(bufferList, decodeMask, fragmentationType) {
        var temp;
        if (typeof(this.parseState) === 'undefined') {
            if (decodeMask) {
                this.parseState = LOAD_MASK_KEY;
                this.decodeMask = true;
            }
            else {
                this.parseState = DECODE_HEADER;
                this.decodeMask = false;
            }
        }
        if (this.parseState === LOAD_MASK_KEY) {
            if (bufferList.length >= 4) {
                this.maskBytes = bufferList.take(4);
                bufferList.advance(4);
                this.maskPos = 0;
                var maskKey = ctio.ruint32(this.maskBytes, 'big', 0);
                this.parseState = DECODE_HEADER;
            }
        }
        if (this.parseState === DECODE_HEADER) {
            if (bufferList.length >= 2) {
                temp = bufferList.take(2);
                this.unmask(temp);
                bufferList.advance(2);
                var firstByte = temp[0];
                var secondByte = temp[1];

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
                temp = bufferList.take(2);
                this.unmask(temp);
                bufferList.advance(2);
                this.length = ctio.ruint16(temp, 'big', 0);
                this.parseState = WAITING_FOR_PAYLOAD;
            }
        }
        else if (this.parseState === WAITING_FOR_64_BIT_LENGTH) {
            if (bufferList.length >= 8) {
                temp = bufferList.take(8);
                this.unmask(temp);
                bufferList.advance(8);
                var lengthPair = ctio.ruint64(temp, 'big', 0);
                if (lengthPair[0] !== 0) {
                    this.parseError = true;
                    console.error("Unsupported 64-bit length frame received");
                    return true;
                }
                this.length = lengthPair[1];
                this.parseState = WAITING_FOR_PAYLOAD;
            }
        }
        if (this.parseState === WAITING_FOR_PAYLOAD) {
            // If the frame has a CONTINUATION opcode, we have to use
			// the opcode from the first fragmented frame.  Only text
			// and binary frames can be fragmented.
			if ((this.opcode === 0x00 && fragmentationType === 0x04) || // Continuation with Text Frame
				 this.opcode === 0x04) { // Normal Text Frame
				if (bufferList.length >= this.length) {
				    temp = bufferList.take(this.length);
				    this.unmask(temp);
				    bufferList.advance(this.length);
					this.utf8Payload = temp.toString('utf8');
					this.parseState = COMPLETE;
					return true;
				}
			}
			else if ((this.opcode === 0x00 && fragmentationType === 0x05) || // Continuation with Text Frame
					  this.opcode === 0x05) { // Normal Binary Frame
				if (bufferList.length >= this.length) {
					this.binaryPayload = bufferList.take(this.length);
					this.unmask(this.binaryPayload);
					bufferList.advance(this.length);
					this.parseState = COMPLETE;
					return true;
				}
			}
			else {
				switch (this.opcode) {
					case 0x00: // WebSocketOpcode.CONTINUATION
					    // Unhandled continuation frame
						this.error = true;
						return true;

					case 0x02: // WebSocketOpcode.PING
						return this.throwAwayPayload(bufferList);
					
					case 0x03: // WebSocketOpcode.PONG
						return this.throwAwayPayload(bufferList);
					
					case 0x01: //WebSocketOpcode.CONNECTION_CLOSE
						return this.throwAwayPayload(bufferList);
					
					default:
						// unknown frame... eat up any data and move on.
						console.error("WebSocket: Unknown frame opcode.  Skipping frame.");
						return this.throwAwayPayload(bufferList);
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
    unmask: function(buffer) {
        if (this.decodeMask) {
            for (var i=0; i < buffer.length; i++) {
                buffer[i] = buffer[i] ^ this.maskBytes[this.maskPos];
                this.maskPos = (this.maskPos + 1) & 3;
            }
        }
        return buffer;
    },
    toBuffer: function(socket, applyMask, nullMask) {
        var maskKey;
        var maskBytes;
        var frameHeader;
        var headerLength = 2;
        var data;
        var firstByte = 0x00;
        var secondByte = 0x00;
        
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
            this.length = Buffer.byteLength(this.utf8Payload, 'utf8');
            data = new Buffer(this.length);
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

        // build the frame header
        frameHeader = new Buffer(headerLength);
        frameHeader[0] = firstByte;
        frameHeader[1] = secondByte;

        if (this.length > 125 && this.length <= 0xFFFF) {
            // write 16-bit length
            ctio.wuint16(this.length, 'big', frameHeader, 2);
        }
        else if (this.length > 0xFFFF) {
            // write 64-bit length
            ctio.wuint64([0x00000000, this.length], 'big', frameHeader, 2);
        }

        var outputLength = this.length + headerLength;

        if (applyMask) {
            if (!nullMask) {
                // Generate a mask key
                maskKey = Math.ceil(Math.random()*0xFFFFFFFF);
            }
            else {
                maskKey = 0x00000000;
            }
            maskBytes = new Buffer(4);
            ctio.wuint32(maskKey, buffer, 'big', 0);
            
            output = new Buffer(outputLength + 4); // extra 4 bytes for mask
            
            // write the mask key
            maskBytes.copy(ouptut, 0);
            
            // Mask and write the header and payload
            var i;
            var j = 0;
            var k = 0;

            for (i = 0; i < headerLength; i ++) {
                output[k] = frameHeader[i] ^ maskBytes[j];
                j = (j + 1) & 3;
                k ++;
            }
            for (i = 0; i < this.length; i ++) {
                output[k] = data[i] ^ maskBytes[j];
                j = (j + 1) & 3;
                k ++;
            }
        }
        else {
            output = new Buffer(outputLength);
            
            // Write the frame header and payload without masking
            frameHeader.copy(output, 0);
            if (this.length > 0) {
                data.copy(output, frameHeader.length);
            }
        }

        return output;
    }
});


module.exports = WebSocketFrame;