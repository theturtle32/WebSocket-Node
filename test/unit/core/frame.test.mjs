import { describe, it, expect } from 'vitest';
import bufferEqual from 'buffer-equal';
import WebSocketFrame from '../../../lib/WebSocketFrame.js';
// import { Buffer.allocUnsafe, Buffer.from } from '../../../lib/utils.js';

describe('WebSocketFrame', () => {
  describe('Frame Serialization', () => {
    it('should serialize a WebSocket Frame with no data', () => {
      // WebSocketFrame uses a per-connection buffer for the mask bytes
      // and the frame header to avoid allocating tons of small chunks of RAM.
      const maskBytesBuffer = Buffer.allocUnsafe(4);
      const frameHeaderBuffer = Buffer.allocUnsafe(10);
      
      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x09; // PING opcode
      
      let frameBytes;
      expect(() => {
        frameBytes = frame.toBuffer(true);
      }).not.toThrow();
      
      expect(bufferEqual(frameBytes, Buffer.from('898000000000', 'hex'))).toBe(true);
    });

    it('should serialize a WebSocket Frame with 16-bit length payload', () => {
      const maskBytesBuffer = Buffer.allocUnsafe(4);
      const frameHeaderBuffer = Buffer.allocUnsafe(10);

      const payload = Buffer.allocUnsafe(200);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x02; // WebSocketFrame.BINARY
      frame.binaryPayload = payload;
      
      let frameBytes;
      expect(() => {
        frameBytes = frame.toBuffer(true);
      }).not.toThrow();

      const expected = Buffer.allocUnsafe(2 + 2 + 4 + payload.length);
      expected[0] = 0x82;
      expected[1] = 0xFE;
      expected.writeUInt16BE(payload.length, 2);
      expected.writeUInt32BE(0, 4);
      payload.copy(expected, 8);

      expect(bufferEqual(frameBytes, expected)).toBe(true);
    });

    it('should serialize a WebSocket Frame with 64-bit length payload', () => {
      const maskBytesBuffer = Buffer.allocUnsafe(4);
      const frameHeaderBuffer = Buffer.allocUnsafe(10);

      const payload = Buffer.allocUnsafe(66000);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }

      const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x02; // WebSocketFrame.BINARY
      frame.binaryPayload = payload;
      
      let frameBytes;
      expect(() => {
        frameBytes = frame.toBuffer(true);
      }).not.toThrow();

      const expected = Buffer.allocUnsafe(2 + 8 + 4 + payload.length);
      expected[0] = 0x82;
      expected[1] = 0xFF;
      expected.writeUInt32BE(0, 2);
      expected.writeUInt32BE(payload.length, 6);
      expected.writeUInt32BE(0, 10);
      payload.copy(expected, 14);

      expect(bufferEqual(frameBytes, expected)).toBe(true);
    });
  });
});