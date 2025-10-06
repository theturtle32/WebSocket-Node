import { describe, it, expect, beforeEach } from 'vitest';
import WebSocketFrame from '../../../lib/WebSocketFrame.js';
import { generateWebSocketFrame, generateRandomPayload, generateMalformedFrame } from '../../helpers/generators.mjs';
import { expectValidWebSocketFrame, expectBufferEquals } from '../../helpers/assertions.mjs';

// Mock BufferList for frame parsing tests
class MockBufferList {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  get length() {
    return this.buffer.length - this.offset;
  }

  joinInto(target, targetOffset, sourceOffset, length) {
    this.buffer.copy(target, targetOffset, this.offset + sourceOffset, this.offset + sourceOffset + length);
  }

  advance(bytes) {
    this.offset += bytes;
  }

  take(bytes) {
    const result = this.buffer.subarray(this.offset, this.offset + bytes);
    return result;
  }
}

describe('WebSocketFrame - Comprehensive Testing', () => {
  let maskBytesBuffer, frameHeaderBuffer, config;

  beforeEach(() => {
    maskBytesBuffer = Buffer.allocUnsafe(4);
    frameHeaderBuffer = Buffer.allocUnsafe(10);
    config = {
      maxReceivedFrameSize: 64 * 1024 * 1024 // 64MB default
    };
  });

  describe('Frame Serialization - All Payload Sizes', () => {
    it('should serialize frame with zero-length payload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01; // Text frame
      frame.binaryPayload = Buffer.alloc(0);

      const serialized = frame.toBuffer();
      
      expect(serialized.length).toBe(2);
      expect(serialized[0]).toBe(0x81); // FIN + text opcode
      expect(serialized[1]).toBe(0x00); // No mask, zero length
    });

    it('should serialize frame with small payload (< 126 bytes)', () => {
      const payload = Buffer.from('Hello WebSocket World!');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01; // Text frame
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      
      expect(serialized.length).toBe(2 + payload.length);
      expect(serialized[0]).toBe(0x81); // FIN + text opcode
      expect(serialized[1]).toBe(payload.length); // Direct length encoding
      expect(serialized.subarray(2)).toEqual(payload);
    });

    it('should serialize frame with 16-bit length payload (126-65535 bytes)', () => {
      const payload = Buffer.alloc(1000, 0x42);
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02; // Binary frame
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      
      expect(serialized.length).toBe(4 + payload.length);
      expect(serialized[0]).toBe(0x82); // FIN + binary opcode
      expect(serialized[1]).toBe(126); // 16-bit length indicator
      expect(serialized.readUInt16BE(2)).toBe(1000);
      expect(serialized.subarray(4)).toEqual(payload);
    });

    it('should serialize frame with 64-bit length payload (> 65535 bytes)', () => {
      const payload = Buffer.alloc(70000, 0x43);
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02; // Binary frame
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      
      expect(serialized.length).toBe(10 + payload.length);
      expect(serialized[0]).toBe(0x82); // FIN + binary opcode
      expect(serialized[1]).toBe(127); // 64-bit length indicator
      expect(serialized.readUInt32BE(2)).toBe(0); // High 32 bits
      expect(serialized.readUInt32BE(6)).toBe(70000); // Low 32 bits
      expect(serialized.subarray(10)).toEqual(payload);
    });
  });

  describe('Frame Serialization - All Frame Types', () => {
    it('should serialize text frame (opcode 0x01)', () => {
      const payload = Buffer.from('Hello World', 'utf8');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x81); // FIN + text opcode
    });

    it('should serialize binary frame (opcode 0x02)', () => {
      const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x82); // FIN + binary opcode
    });

    it('should serialize close frame (opcode 0x08)', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08;
      frame.closeStatus = 1000;
      frame.binaryPayload = Buffer.from('Normal closure');

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x88); // FIN + close opcode
      expect(serialized.readUInt16BE(2)).toBe(1000); // Close status code
    });

    it('should serialize ping frame (opcode 0x09)', () => {
      const payload = Buffer.from('ping-payload');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x09;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x89); // FIN + ping opcode
    });

    it('should serialize pong frame (opcode 0x0A)', () => {
      const payload = Buffer.from('pong-payload');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x0A;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x8A); // FIN + pong opcode
    });

    it('should serialize continuation frame (opcode 0x00)', () => {
      const payload = Buffer.from('continuation');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = false;
      frame.mask = false;
      frame.opcode = 0x00;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      expect(serialized[0]).toBe(0x00); // No FIN + continuation opcode
    });
  });

  describe('Frame Serialization - Masking Scenarios', () => {
    it('should serialize masked frame with generated mask key', () => {
      const payload = Buffer.from('Test payload for masking');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x01;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer(false); // Don't use null mask
      
      expect(serialized[1] & 0x80).toBe(0x80); // Mask bit set
      expect(serialized.length).toBe(2 + 4 + payload.length); // Header + mask + payload
    });

    it('should serialize masked frame with null mask (for testing)', () => {
      const payload = Buffer.from('Test payload');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x01;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer(true); // Use null mask
      
      expect(serialized[1] & 0x80).toBe(0x80); // Mask bit set
      // With null mask, the payload should be unmodified after the mask key
      const extractedPayload = serialized.subarray(6);
      expect(extractedPayload).toEqual(payload);
    });

    it('should serialize unmasked frame', () => {
      const payload = Buffer.from('Test payload');
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01;
      frame.binaryPayload = payload;

      const serialized = frame.toBuffer();
      
      expect(serialized[1] & 0x80).toBe(0x00); // Mask bit not set
      expect(serialized.length).toBe(2 + payload.length); // Header + payload only
    });
  });

  describe('Frame Serialization - Control Frame Validation', () => {
    it('should serialize valid control frame at maximum size', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08; // Close frame
      frame.closeStatus = 1000;
      frame.binaryPayload = Buffer.alloc(123, 0x41); // Max allowed is 125 total (2 for status + 123)

      expect(() => frame.toBuffer()).not.toThrow();
      
      const serialized = frame.toBuffer();
      expect(serialized[1]).toBe(125); // Total payload length should be exactly 125
    });

    it('should handle close frame with only status code', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08;
      frame.closeStatus = 1001;

      const serialized = frame.toBuffer();
      expect(serialized[1]).toBe(2); // Only status code, no reason
      expect(serialized.readUInt16BE(2)).toBe(1001);
    });

    it('should handle close frame with no payload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08;
      frame.closeStatus = 1000;
      frame.binaryPayload = null;

      const serialized = frame.toBuffer();
      expect(serialized[1]).toBe(2); // Just the status code
    });
  });

  describe('Frame Parsing - Valid Frame Types', () => {
    it('should parse text frame correctly', () => {
      const originalFrame = generateWebSocketFrame({
        opcode: 0x01,
        payload: 'Hello WebSocket!',
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x01);
      expect(frame.fin).toBe(true);
      expect(frame.binaryPayload.toString('utf8')).toBe('Hello WebSocket!');
    });

    it('should parse binary frame correctly', () => {
      const payload = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      const originalFrame = generateWebSocketFrame({
        opcode: 0x02,
        payload,
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x02);
      expect(frame.binaryPayload).toEqual(payload);
    });

    it('should parse close frame with status and reason', () => {
      const reasonBuffer = Buffer.from('Normal closure');
      const payload = Buffer.alloc(2 + reasonBuffer.length);
      payload.writeUInt16BE(1000, 0);
      reasonBuffer.copy(payload, 2);

      const originalFrame = generateWebSocketFrame({
        opcode: 0x08,
        payload,
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x08);
      expect(frame.closeStatus).toBe(1000);
      expect(frame.binaryPayload.toString('utf8')).toBe('Normal closure');
    });

    it('should parse ping frame correctly', () => {
      const payload = Buffer.from('ping-data');
      const originalFrame = generateWebSocketFrame({
        opcode: 0x09,
        payload,
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x09);
      expect(frame.binaryPayload).toEqual(payload);
    });

    it('should parse pong frame correctly', () => {
      const payload = Buffer.from('pong-data');
      const originalFrame = generateWebSocketFrame({
        opcode: 0x0A,
        payload,
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x0A);
      expect(frame.binaryPayload).toEqual(payload);
    });
  });

  describe('Frame Parsing - Masking/Unmasking', () => {
    it('should parse and unmask client frame correctly', () => {
      const originalPayload = 'Hello WebSocket with masking!';
      const originalFrame = generateWebSocketFrame({
        opcode: 0x01,
        payload: originalPayload,
        masked: true,
        maskingKey: Buffer.from([0x12, 0x34, 0x56, 0x78])
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.mask).toBe(true);
      expect(frame.binaryPayload.toString('utf8')).toBe(originalPayload);
    });

    it('should handle unmasked server frame', () => {
      const originalPayload = 'Server response';
      const originalFrame = generateWebSocketFrame({
        opcode: 0x01,
        payload: originalPayload,
        masked: false
      });

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      const bufferList = new MockBufferList(originalFrame);
      
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.mask).toBe(false);
      expect(frame.binaryPayload.toString('utf8')).toBe(originalPayload);
    });

    it('should handle zero mask key (null masking)', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create a masked frame with all zero mask key
      const payload = Buffer.from('test payload');
      const maskedFrame = Buffer.alloc(2 + 4 + payload.length);
      maskedFrame[0] = 0x81; // FIN + text opcode
      maskedFrame[1] = 0x80 | payload.length; // Masked + length
      // Mask key is all zeros (bytes 2-5)
      payload.copy(maskedFrame, 6); // Payload unchanged due to zero mask
      
      const bufferList = new MockBufferList(maskedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.mask).toBe(true);
      expect(frame.binaryPayload.toString('utf8')).toBe('test payload');
    });

    it('should handle different mask key patterns', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Test with mask key [0xFF, 0xFF, 0xFF, 0xFF] (all bits flipped)
      const payload = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
      const maskKey = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
      const maskedPayload = Buffer.alloc(payload.length);
      
      for (let i = 0; i < payload.length; i++) {
        maskedPayload[i] = payload[i] ^ maskKey[i % 4];
      }
      
      const maskedFrame = Buffer.alloc(2 + 4 + maskedPayload.length);
      maskedFrame[0] = 0x81; // FIN + text opcode
      maskedFrame[1] = 0x80 | payload.length; // Masked + length
      maskKey.copy(maskedFrame, 2);
      maskedPayload.copy(maskedFrame, 6);
      
      const bufferList = new MockBufferList(maskedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.mask).toBe(true);
      expect(frame.binaryPayload).toEqual(payload);
      expect(frame.binaryPayload.toString('utf8')).toBe('Hello');
    });
  });

  describe('Frame Parsing - Malformed Frame Detection', () => {
    it('should detect control frame longer than 125 bytes', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create a malformed ping frame with length > 125
      const malformedFrame = Buffer.alloc(130);
      malformedFrame[0] = 0x89; // FIN + ping opcode
      malformedFrame[1] = 126; // Invalid: control frames can't use extended length
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.protocolError).toBe(true);
      expect(frame.dropReason).toContain('control frame longer than 125 bytes');
    });

    it('should reject control frames using extended length encoding', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Control frames must not use 16-bit length encoding, even for smaller payloads
      const malformedFrame = Buffer.alloc(10);
      malformedFrame[0] = 0x8A; // FIN + pong opcode  
      malformedFrame[1] = 126; // 16-bit length indicator (invalid for control frames)
      malformedFrame.writeUInt16BE(10, 2); // Actual length 10 (which would be valid as direct encoding)
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.protocolError).toBe(true);
      expect(frame.dropReason).toContain('Illegal control frame longer than 125 bytes');
    });

    it('should allow control frames with exactly 125 bytes payload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create a ping frame with exactly 125 bytes payload (maximum allowed)
      const validFrame = Buffer.alloc(127); // 2 header + 125 payload
      validFrame[0] = 0x89; // FIN + ping opcode
      validFrame[1] = 125; // Length 125 (maximum allowed for control frames)
      validFrame.fill(0x42, 2); // Fill payload with test data
      
      const bufferList = new MockBufferList(validFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.protocolError).toBe(false);
      expect(frame.opcode).toBe(0x09);
      expect(frame.binaryPayload.length).toBe(125);
    });

    it('should detect fragmented control frame', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create a close frame without FIN bit set
      const malformedFrame = Buffer.alloc(10);
      malformedFrame[0] = 0x08; // No FIN + close opcode
      malformedFrame[1] = 0x02; // Length 2
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.protocolError).toBe(true);
      expect(frame.dropReason).toContain('Control frames must not be fragmented');
    });

    it('should detect unsupported 64-bit length', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create frame with high 32-bits set (unsupported large frame)
      const malformedFrame = Buffer.alloc(20);
      malformedFrame[0] = 0x82; // FIN + binary opcode
      malformedFrame[1] = 127; // 64-bit length indicator
      malformedFrame.writeUInt32BE(1, 2); // High 32 bits = 1 (unsupported)
      malformedFrame.writeUInt32BE(0, 6); // Low 32 bits = 0
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.protocolError).toBe(true);
      expect(frame.dropReason).toContain('Unsupported 64-bit length frame');
    });

    it('should detect frame exceeding maximum size', () => {
      const smallConfig = { maxReceivedFrameSize: 1000 };
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, smallConfig);
      
      // Create frame claiming to be larger than max size
      const malformedFrame = Buffer.alloc(20);
      malformedFrame[0] = 0x82; // FIN + binary opcode
      malformedFrame[1] = 126; // 16-bit length
      malformedFrame.writeUInt16BE(2000, 2); // Length exceeds max
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.frameTooLarge).toBe(true);
      expect(frame.dropReason).toContain('Frame size of 2000 bytes exceeds maximum');
    });

    it('should detect invalid close frame length', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create close frame with length 1 (invalid - must be 0 or >= 2)
      const malformedFrame = Buffer.alloc(10);
      malformedFrame[0] = 0x88; // FIN + close opcode
      malformedFrame[1] = 0x01; // Invalid length 1
      malformedFrame[2] = 0x42; // Single byte payload
      
      const bufferList = new MockBufferList(malformedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.invalidCloseFrameLength).toBe(true);
      expect(frame.binaryPayload.length).toBe(0); // Should be cleared
    });

    it('should parse close frame with zero length correctly', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create close frame with no payload (valid)
      const validFrame = Buffer.from([0x88, 0x00]); // FIN + close opcode, length 0
      
      const bufferList = new MockBufferList(validFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x08);
      expect(frame.invalidCloseFrameLength).toBe(false);
      expect(frame.closeStatus).toBe(-1); // No status code provided
      expect(frame.binaryPayload.length).toBe(0);
    });

    it('should validate reserved opcodes', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Test reserved opcode 0x3 (should be accepted as the implementation doesn't validate opcodes)
      const reservedFrame = Buffer.from([0x83, 0x05, 0x48, 0x65, 0x6C, 0x6C, 0x6F]); // Reserved opcode + "Hello"
      
      const bufferList = new MockBufferList(reservedFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x03);
      expect(frame.protocolError).toBe(false); // Implementation doesn't validate opcodes during parsing
      expect(frame.binaryPayload.toString('utf8')).toBe('Hello');
    });

    it('should parse continuation frames correctly', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create a continuation frame (opcode 0x00)
      const contFrame = Buffer.from([0x80, 0x05, 0x77, 0x6F, 0x72, 0x6C, 0x64]); // FIN + continuation + "world"
      
      const bufferList = new MockBufferList(contFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.opcode).toBe(0x00); // Continuation opcode
      expect(frame.fin).toBe(true);
      expect(frame.protocolError).toBe(false);
      expect(frame.binaryPayload.toString('utf8')).toBe('world');
    });
  });

  describe('Frame Parsing - Incomplete Frame Handling', () => {
    it('should handle incomplete frame header', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Only provide first byte of header
      const incompleteFrame = Buffer.from([0x81]);
      const bufferList = new MockBufferList(incompleteFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(1); // DECODE_HEADER
    });

    it('should handle incomplete 16-bit length', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Provide header indicating 16-bit length but no length bytes
      const incompleteFrame = Buffer.from([0x81, 126]);
      const bufferList = new MockBufferList(incompleteFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(2); // WAITING_FOR_16_BIT_LENGTH
    });

    it('should handle incomplete 64-bit length', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Provide header indicating 64-bit length but only partial length bytes
      const incompleteFrame = Buffer.from([0x81, 127, 0x00, 0x00]);
      const bufferList = new MockBufferList(incompleteFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(3); // WAITING_FOR_64_BIT_LENGTH
    });

    it('should handle incomplete mask key', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Provide header indicating masked frame but no mask key
      const incompleteFrame = Buffer.from([0x81, 0x85]); // Masked, length 5
      const bufferList = new MockBufferList(incompleteFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(4); // WAITING_FOR_MASK_KEY
    });

    it('should handle incomplete payload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Provide complete header claiming 10 bytes but only 5 bytes of payload
      const incompleteFrame = Buffer.from([0x81, 0x0A, 0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello" (5 bytes of 10)
      const bufferList = new MockBufferList(incompleteFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(5); // WAITING_FOR_PAYLOAD
    });
  });

  describe('Frame Parsing - Edge Cases', () => {
    it('should handle zero-length payload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      const zeroLengthFrame = Buffer.from([0x81, 0x00]); // Text frame, no payload
      const bufferList = new MockBufferList(zeroLengthFrame);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(true);
      expect(frame.binaryPayload.length).toBe(0);
    });

    it('should handle maximum valid frame size', () => {
      const maxSize = 1000;
      const maxConfig = { maxReceivedFrameSize: maxSize };
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, maxConfig);
      
      // Create frame at exactly the maximum size
      const header = Buffer.alloc(4);
      header[0] = 0x82; // FIN + binary opcode
      header[1] = 126;  // 16-bit length indicator
      header.writeUInt16BE(maxSize, 2);
      const payload = Buffer.alloc(maxSize, 0x42);
      const maxFrame = Buffer.concat([header, payload]);
      
      const bufferList = new MockBufferList(maxFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.frameTooLarge).toBe(false);
      expect(frame.binaryPayload.length).toBe(maxSize);
    });

    it('should handle reserved bits correctly', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Create frame with RSV bits set (should be preserved during parsing)
      const frameWithRSV = Buffer.from([0xF1, 0x05, 0x48, 0x65, 0x6C, 0x6C, 0x6F]); // RSV1,2,3 set + "Hello"
      const bufferList = new MockBufferList(frameWithRSV);
      
      const complete = frame.addData(bufferList);
      expect(complete).toBe(true);
      expect(frame.rsv1).toBe(true);
      expect(frame.rsv2).toBe(true);
      expect(frame.rsv3).toBe(true);
    });
  });

  describe('Frame Utility Methods', () => {
    it('should provide meaningful toString output', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.opcode = 0x01;
      frame.fin = true;
      frame.length = 10;
      frame.mask = true;
      frame.binaryPayload = Buffer.from('test');

      const description = frame.toString();
      expect(description).toContain('Opcode: 1');
      expect(description).toContain('fin: true');
      expect(description).toContain('length: 10');
      expect(description).toContain('hasPayload: true');
      expect(description).toContain('masked: true');
    });

    it('should set length property correctly during parsing', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      
      // Test with 16-bit length encoding
      const payload = Buffer.alloc(200, 0x42);
      const testFrame = Buffer.alloc(4 + payload.length);
      testFrame[0] = 0x82; // FIN + binary opcode
      testFrame[1] = 126; // 16-bit length indicator
      testFrame.writeUInt16BE(payload.length, 2);
      payload.copy(testFrame, 4);
      
      const bufferList = new MockBufferList(testFrame);
      const complete = frame.addData(bufferList);
      
      expect(complete).toBe(true);
      expect(frame.length).toBe(200); // Should match actual payload length
      expect(frame.binaryPayload.length).toBe(200);
    });

    it('should handle throwAwayPayload correctly', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.length = 100;
      frame.parseState = 5; // WAITING_FOR_PAYLOAD
      
      const bufferList = new MockBufferList(Buffer.alloc(150));
      const complete = frame.throwAwayPayload(bufferList);
      
      expect(complete).toBe(true);
      expect(bufferList.offset).toBe(100);
      expect(frame.parseState).toBe(6); // COMPLETE
    });

    it('should handle partial throwAwayPayload', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.length = 100;
      frame.parseState = 5; // WAITING_FOR_PAYLOAD
      
      const bufferList = new MockBufferList(Buffer.alloc(50)); // Not enough data
      const complete = frame.throwAwayPayload(bufferList);
      
      expect(complete).toBe(false);
      expect(frame.parseState).toBe(5); // Still WAITING_FOR_PAYLOAD
    });
  });

  describe('RSV Bits and Reserved Opcodes', () => {
    it('should preserve RSV bits during serialization', () => {
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.rsv1 = true;
      frame.rsv2 = false;
      frame.rsv3 = true;
      frame.mask = false;
      frame.opcode = 0x01;
      frame.binaryPayload = Buffer.from('test');

      const serialized = frame.toBuffer();
      
      const firstByte = serialized[0];
      expect(firstByte & 0x80).toBe(0x80); // FIN
      expect(firstByte & 0x40).toBe(0x40); // RSV1
      expect(firstByte & 0x20).toBe(0x00); // RSV2
      expect(firstByte & 0x10).toBe(0x10); // RSV3
      expect(firstByte & 0x0F).toBe(0x01); // Opcode
    });

    it('should handle all RSV combinations', () => {
      const combinations = [
        { rsv1: false, rsv2: false, rsv3: false },
        { rsv1: true,  rsv2: false, rsv3: false },
        { rsv1: false, rsv2: true,  rsv3: false },
        { rsv1: false, rsv2: false, rsv3: true },
        { rsv1: true,  rsv2: true,  rsv3: true }
      ];

      combinations.forEach(({ rsv1, rsv2, rsv3 }) => {
        const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
        frame.fin = true;
        frame.rsv1 = rsv1;
        frame.rsv2 = rsv2;
        frame.rsv3 = rsv3;
        frame.mask = false;
        frame.opcode = 0x01;
        frame.binaryPayload = Buffer.from('test');

        const serialized = frame.toBuffer();
        const frameInfo = expectValidWebSocketFrame(serialized, { allowReservedBits: true });
        
        expect(frameInfo.rsv1).toBe(rsv1);
        expect(frameInfo.rsv2).toBe(rsv2);
        expect(frameInfo.rsv3).toBe(rsv3);
      });
    });
  });

  describe('Performance and Memory Efficiency', () => {
    it('should handle large payloads efficiently', () => {
      const largePayload = generateRandomPayload(1024 * 1024); // 1MB
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, config);
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.from(largePayload);

      const startTime = process.hrtime.bigint();
      const serialized = frame.toBuffer();
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1e6;
      
      expect(serialized.length).toBe(10 + largePayload.length);
      expect(durationMs).toBeLessThan(100); // Should serialize within 100ms
    });

    it('should reuse provided buffers for mask and header', () => {
      const customMaskBuffer = Buffer.alloc(4);
      const customHeaderBuffer = Buffer.alloc(10);
      
      const frame = new WebSocketFrame(customMaskBuffer, customHeaderBuffer, config);
      
      expect(frame.maskBytes).toBe(customMaskBuffer);
      expect(frame.frameHeader).toBe(customHeaderBuffer);
    });
  });
});