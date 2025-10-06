import { bench, describe } from 'vitest';
import WebSocketFrame from '../../lib/WebSocketFrame.js';

// Pre-allocate payloads outside benchmark loops
const smallPayload = Buffer.from('Hello, WebSocket!');
const mediumPayload = Buffer.alloc(1024);
mediumPayload.fill('x');
const largePayload = Buffer.alloc(64 * 1024);
largePayload.fill('y');

// Pre-allocate mask
const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);

// Each operation gets its own describe block so Vitest doesn't treat them as
// alternatives for comparison. This allows each benchmark to be measured independently.

describe('Serialize Small Text Frame (Unmasked)', () => {
  bench('serialize small text frame (17 bytes, unmasked)', () => {
    const frame = new WebSocketFrame(smallPayload, true, 0x01);
    frame.toBuffer();
  });
});

describe('Serialize Small Text Frame (Masked)', () => {
  bench('serialize small text frame (17 bytes, masked)', () => {
    const frame = new WebSocketFrame(smallPayload, true, 0x01);
    frame.mask = mask;
    frame.toBuffer();
  });
});

describe('Serialize Medium Binary Frame (1KB)', () => {
  bench('serialize medium binary frame (1KB)', () => {
    const frame = new WebSocketFrame(mediumPayload, true, 0x02);
    frame.toBuffer();
  });
});

describe('Serialize Large Binary Frame (64KB)', () => {
  bench('serialize large binary frame (64KB)', () => {
    const frame = new WebSocketFrame(largePayload, true, 0x02);
    frame.toBuffer();
  });
});
