import { describe, it, expect } from 'vitest';
import WebSocketFrame from '../../../lib/WebSocketFrame.js';
import utils from '../../../lib/utils.js';

const bufferAllocUnsafe = utils.bufferAllocUnsafe;
const bufferFromString = utils.bufferFromString;

describe('Serializing a WebSocket Frame with no data', () => {
  it('should generate correct bytes', () => {
    // WebSocketFrame uses a per-connection buffer for the mask bytes
    // and the frame header to avoid allocating tons of small chunks of RAM.
    const maskBytesBuffer = bufferAllocUnsafe(4);
    const frameHeaderBuffer = bufferAllocUnsafe(10);

    let frameBytes;
    const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
    frame.fin = true;
    frame.mask = true;
    frame.opcode = 0x09; // WebSocketFrame.PING

    expect(() => {
      frameBytes = frame.toBuffer(true);
    }).not.toThrow();

    expect(frameBytes.equals(bufferFromString('898000000000', 'hex'))).toBe(true);
  });
});

describe('Serializing a WebSocket Frame with 16-bit length payload', () => {
  it('should generate correct bytes', () => {
    const maskBytesBuffer = bufferAllocUnsafe(4);
    const frameHeaderBuffer = bufferAllocUnsafe(10);

    const payload = bufferAllocUnsafe(200);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = i % 256;
    }

    let frameBytes;
    const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
    frame.fin = true;
    frame.mask = true;
    frame.opcode = 0x02; // WebSocketFrame.BINARY
    frame.binaryPayload = payload;

    expect(() => {
      frameBytes = frame.toBuffer(true);
    }).not.toThrow();

    const expected = bufferAllocUnsafe(2 + 2 + 4 + payload.length);
    expected[0] = 0x82;
    expected[1] = 0xFE;
    expected.writeUInt16BE(payload.length, 2);
    expected.writeUInt32BE(0, 4);
    payload.copy(expected, 8);

    expect(frameBytes.equals(expected)).toBe(true);
  });
});

describe('Serializing a WebSocket Frame with 64-bit length payload', () => {
  it('should generate correct bytes', () => {
    const maskBytesBuffer = bufferAllocUnsafe(4);
    const frameHeaderBuffer = bufferAllocUnsafe(10);

    const payload = bufferAllocUnsafe(66000);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = i % 256;
    }

    let frameBytes;
    const frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
    frame.fin = true;
    frame.mask = true;
    frame.opcode = 0x02; // WebSocketFrame.BINARY
    frame.binaryPayload = payload;

    expect(() => {
      frameBytes = frame.toBuffer(true);
    }).not.toThrow();

    const expected = bufferAllocUnsafe(2 + 8 + 4 + payload.length);
    expected[0] = 0x82;
    expected[1] = 0xFF;
    expected.writeUInt32BE(0, 2);
    expected.writeUInt32BE(payload.length, 6);
    expected.writeUInt32BE(0, 10);
    payload.copy(expected, 14);

    expect(frameBytes.equals(expected)).toBe(true);
  });
});
