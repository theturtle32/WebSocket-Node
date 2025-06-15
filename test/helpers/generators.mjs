import crypto from 'crypto';

export function generateWebSocketFrame(options = {}) {
  const {
    opcode = 0x1, // Text frame
    fin = true,
    rsv1 = false,
    rsv2 = false,
    rsv3 = false,
    masked = false,
    payload = 'Hello World',
    maskingKey = null,
    // New option for frame validation
    validate = true
  } = options;

  let payloadBuffer;
  if (typeof payload === 'string') {
    payloadBuffer = Buffer.from(payload, 'utf8');
  } else if (Buffer.isBuffer(payload)) {
    payloadBuffer = payload;
  } else {
    payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  }

  const payloadLength = payloadBuffer.length;
  let headerSize = 2; // Minimum header size
  let lengthBytes = 0;

  // Determine payload length encoding
  if (payloadLength < 126) {
    lengthBytes = 0;
  } else if (payloadLength < 65536) {
    headerSize += 2;
    lengthBytes = 2;
  } else {
    headerSize += 8;
    lengthBytes = 8;
  }

  // Add masking key size if masked
  if (masked) {
    headerSize += 4;
  }

  const frame = Buffer.alloc(headerSize + payloadLength);
  let offset = 0;

  // First byte: FIN + RSV + Opcode
  let firstByte = opcode & 0x0F;
  if (fin) firstByte |= 0x80;
  if (rsv1) firstByte |= 0x40;
  if (rsv2) firstByte |= 0x20;
  if (rsv3) firstByte |= 0x10;
  frame[offset++] = firstByte;

  // Second byte: MASK + Payload length
  let secondByte = 0;
  if (masked) secondByte |= 0x80;

  if (payloadLength < 126) {
    secondByte |= payloadLength;
    frame[offset++] = secondByte;
  } else if (payloadLength < 65536) {
    secondByte |= 126;
    frame[offset++] = secondByte;
    frame.writeUInt16BE(payloadLength, offset);
    offset += 2;
  } else {
    secondByte |= 127;
    frame[offset++] = secondByte;
    // Write 64-bit length (high 32 bits = 0 for small payloads)
    frame.writeUInt32BE(0, offset);
    frame.writeUInt32BE(payloadLength, offset + 4);
    offset += 8;
  }

  // Masking key
  let mask;
  if (masked) {
    mask = maskingKey || crypto.randomBytes(4);
    mask.copy(frame, offset);
    offset += 4;
  }

  // Payload (with masking if required)
  if (masked && mask) {
    for (let i = 0; i < payloadLength; i++) {
      frame[offset + i] = payloadBuffer[i] ^ mask[i % 4];
    }
  } else {
    payloadBuffer.copy(frame, offset);
  }

  // Validate frame if requested
  if (validate) {
    validateGeneratedFrame(frame, options);
  }

  return frame;
}

export function generateRandomPayload(size = 1024, type = 'text') {
  switch (type) {
    case 'text':
      return generateRandomText(size);
    case 'binary':
      return generateRandomBinary(size);
    case 'json':
      return generateRandomJSON(size);
    case 'base64':
      return generateRandomBase64(size);
    default:
      throw new Error(`Unknown payload type: ${type}`);
  }
}

export function generateRandomText(size = 1024) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n\t';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateRandomBinary(size = 1024) {
  return crypto.randomBytes(size);
}

export function generateRandomJSON(approxSize = 1024) {
  const data = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'test_message',
    payload: {}
  };

  // Fill payload to approximate size
  const overhead = JSON.stringify(data).length;
  const targetPayloadSize = Math.max(0, approxSize - overhead - 100); // Leave room for structure
  
  if (targetPayloadSize > 0) {
    data.payload.data = generateRandomText(targetPayloadSize);
  }

  return JSON.stringify(data);
}

export function generateRandomBase64(size = 1024) {
  const binarySize = Math.ceil(size * 3 / 4); // Base64 is ~4/3 expansion
  return crypto.randomBytes(binarySize).toString('base64').substring(0, size);
}

export function generateMalformedFrame(type = 'invalid_opcode') {
  switch (type) {
    case 'invalid_opcode':
      return generateWebSocketFrame({ opcode: 0x6 }); // Reserved opcode
    
    case 'invalid_rsv':
      return generateWebSocketFrame({ rsv1: true, rsv2: true, rsv3: true });
    
    case 'fragmented_control':
      return generateWebSocketFrame({ opcode: 0x8, fin: false }); // Fragmented close frame
    
    case 'oversized_control':
      return generateWebSocketFrame({ 
        opcode: 0x8, 
        payload: 'x'.repeat(126) // Control frames must be < 126 bytes
      });
    
    case 'invalid_utf8':
      // Create invalid UTF-8 sequence
      const invalidUtf8 = Buffer.from([0xc0, 0x80]); // Overlong encoding
      return generateWebSocketFrame({ payload: invalidUtf8 });
    
    case 'unmasked_client':
      // Client frames must be masked, server frames must not be
      return generateWebSocketFrame({ masked: false, payload: 'client message' });
    
    case 'masked_server':
      return generateWebSocketFrame({ masked: true, payload: 'server message' });
    
    case 'incomplete_header':
      const frame = generateWebSocketFrame();
      return frame.subarray(0, 1); // Truncate header
    
    case 'incomplete_payload':
      const fullFrame = generateWebSocketFrame({ payload: 'Hello World' });
      return fullFrame.subarray(0, fullFrame.length - 5); // Truncate payload
    
    case 'invalid_length':
      // Create frame with payload length that doesn't match actual payload
      const buffer = Buffer.alloc(10);
      buffer[0] = 0x81; // FIN + text frame
      buffer[1] = 0x7F; // 127 length indicator but no extended length
      return buffer;
    
    default:
      throw new Error(`Unknown malformed frame type: ${type}`);
  }
}

export function generateProtocolViolation(type = 'close_after_close') {
  switch (type) {
    case 'close_after_close':
      return [
        generateWebSocketFrame({ opcode: 0x8, payload: Buffer.from([0x03, 0xe8]) }), // Close frame
        generateWebSocketFrame({ opcode: 0x8, payload: Buffer.from([0x03, 0xe8]) })  // Second close frame
      ];
    
    case 'data_after_close':
      return [
        generateWebSocketFrame({ opcode: 0x8, payload: Buffer.from([0x03, 0xe8]) }), // Close frame
        generateWebSocketFrame({ opcode: 0x1, payload: 'Hello' })                    // Data after close
      ];
    
    case 'ping_after_close':
      return [
        generateWebSocketFrame({ opcode: 0x8, payload: Buffer.from([0x03, 0xe8]) }), // Close frame
        generateWebSocketFrame({ opcode: 0x9, payload: 'ping' })                     // Ping after close
      ];
    
    case 'invalid_continuation':
      return [
        generateWebSocketFrame({ opcode: 0x0, payload: 'continuation without start' }) // Continuation without initial frame
      ];
    
    case 'interleaved_control':
      return [
        generateWebSocketFrame({ opcode: 0x1, fin: false, payload: 'start' }),       // Start text frame
        generateWebSocketFrame({ opcode: 0x1, fin: false, payload: 'middle' }),      // Invalid: should be continuation
        generateWebSocketFrame({ opcode: 0x0, fin: true, payload: 'end' })           // End continuation
      ];
    
    default:
      throw new Error(`Unknown protocol violation type: ${type}`);
  }
}

export function generateFragmentedMessage(message, fragmentSizes = [10, 20, 15]) {
  const messageBuffer = Buffer.from(message, 'utf8');
  const fragments = [];
  let offset = 0;

  for (let i = 0; i < fragmentSizes.length; i++) {
    const isFirst = i === 0;
    const isLast = i === fragmentSizes.length - 1 || offset + fragmentSizes[i] >= messageBuffer.length;
    const fragmentSize = Math.min(fragmentSizes[i], messageBuffer.length - offset);
    
    const fragment = messageBuffer.subarray(offset, offset + fragmentSize);
    const opcode = isFirst ? 0x1 : 0x0; // Text frame for first, continuation for rest
    
    fragments.push(generateWebSocketFrame({
      opcode,
      fin: isLast,
      payload: fragment
    }));
    
    offset += fragmentSize;
    if (offset >= messageBuffer.length) break;
  }

  return fragments;
}

export function generateLargePayload(size = 1024 * 1024) {
  // Generate payload in chunks to avoid memory issues with very large payloads
  const chunkSize = 64 * 1024;
  const chunks = [];
  let remaining = size;

  while (remaining > 0) {
    const currentChunkSize = Math.min(chunkSize, remaining);
    chunks.push(generateRandomText(currentChunkSize));
    remaining -= currentChunkSize;
  }

  return chunks.join('');
}

export function generatePerformanceTestPayloads() {
  return {
    tiny: generateRandomText(10),
    small: generateRandomText(1024),
    medium: generateRandomText(64 * 1024),
    large: generateRandomText(1024 * 1024),
    binary_small: generateRandomBinary(1024),
    binary_large: generateRandomBinary(1024 * 1024),
    json_small: generateRandomJSON(1024),
    json_large: generateRandomJSON(64 * 1024)
  };
}

export function generateConnectionParams() {
  return {
    validOrigins: ['http://localhost', 'https://example.com', 'https://test.example.com'],
    invalidOrigins: ['http://malicious.com', 'javascript:alert(1)', ''],
    validProtocols: ['chat', 'echo', 'websocket-test'],
    invalidProtocols: ['', 'invalid protocol', '  '],
    validHeaders: {
      'User-Agent': 'WebSocket-Test/1.0',
      'X-Forwarded-For': '192.168.1.100',
      'Authorization': 'Bearer test-token'
    },
    invalidHeaders: {
      'Connection': 'close', // Should be 'upgrade'
      'Upgrade': 'http/1.1', // Should be 'websocket'
      'Sec-WebSocket-Version': '12' // Should be '13'
    }
  };
}

// Frame validation function to ensure generated frames are WebSocket-compliant
function validateGeneratedFrame(frame, options) {
  const { 
    opcode = 0x1, 
    fin = true, 
    rsv1 = false, 
    rsv2 = false, 
    rsv3 = false, 
    masked = false 
  } = options;
  
  if (frame.length < 2) {
    throw new Error('Generated frame too short - minimum 2 bytes required');
  }
  
  // Validate first byte (FIN + RSV + Opcode)
  const firstByte = frame[0];
  const actualFin = !!(firstByte & 0x80);
  const actualRsv1 = !!(firstByte & 0x40);
  const actualRsv2 = !!(firstByte & 0x20);
  const actualRsv3 = !!(firstByte & 0x10);
  const actualOpcode = firstByte & 0x0F;
  
  if (actualFin !== fin) {
    throw new Error(`FIN bit mismatch: expected ${fin}, got ${actualFin}`);
  }
  if (actualRsv1 !== rsv1) {
    throw new Error(`RSV1 bit mismatch: expected ${rsv1}, got ${actualRsv1}`);
  }
  if (actualRsv2 !== rsv2) {
    throw new Error(`RSV2 bit mismatch: expected ${rsv2}, got ${actualRsv2}`);
  }
  if (actualRsv3 !== rsv3) {
    throw new Error(`RSV3 bit mismatch: expected ${rsv3}, got ${actualRsv3}`);
  }
  if (actualOpcode !== opcode) {
    throw new Error(`Opcode mismatch: expected ${opcode}, got ${actualOpcode}`);
  }
  
  // Validate second byte (MASK + payload length indicator)  
  const secondByte = frame[1];
  const actualMasked = !!(secondByte & 0x80);
  
  if (actualMasked !== masked) {
    throw new Error(`MASK bit mismatch: expected ${masked}, got ${actualMasked}`);
  }
  
  // Validate control frame constraints
  if (opcode >= 0x8) { // Control frames
    if (!fin) {
      throw new Error('Control frames must have FIN=1');
    }
    
    // Calculate payload length to check control frame size limit
    const lengthIndicator = secondByte & 0x7F;
    if (lengthIndicator >= 126) {
      throw new Error('Control frames cannot use extended length encoding');
    }
    if (lengthIndicator > 125) {
      throw new Error('Control frame payload cannot exceed 125 bytes');
    }
  }
  
  // Validate opcode ranges
  if (opcode > 0xF) {
    throw new Error(`Invalid opcode: ${opcode} - must be 0-15`);
  }
  
  // Check for reserved opcodes (0x3-0x7, 0xB-0xF)
  if ((opcode >= 0x3 && opcode <= 0x7) || (opcode >= 0xB && opcode <= 0xF)) {
    // Only throw if validation is explicitly enabled and we're not testing reserved opcodes
    if (options.validate !== false) {
      throw new Error(`Reserved opcode: ${opcode}`);
    }
  }
}

// Enhanced frame processing utilities for tests
export function injectFrameIntoConnection(connection, frame, options = {}) {
  const { 
    delay = 0,
    chunkSize = null, // If specified, send frame in chunks to test partial processing
    validate = true
  } = options;
  
  if (validate && !Buffer.isBuffer(frame)) {
    throw new Error('Frame must be a Buffer');
  }
  
  return new Promise((resolve, reject) => {
    const sendFrame = () => {
      try {
        if (chunkSize && frame.length > chunkSize) {
          // Send frame in chunks to simulate partial TCP receive
          let offset = 0;
          const sendChunk = () => {
            if (offset >= frame.length) {
              resolve();
              return;
            }
            
            const chunk = frame.subarray(offset, Math.min(offset + chunkSize, frame.length));
            connection.socket.emit('data', chunk);
            offset += chunk.length;
            
            // Small delay between chunks to simulate network timing
            setTimeout(sendChunk, 1);
          };
          sendChunk();
        } else {
          // Send entire frame at once
          connection.socket.emit('data', frame);
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };
    
    if (delay > 0) {
      setTimeout(sendFrame, delay);
    } else {
      sendFrame();
    }
  });
}

// Wait for WebSocket processing with enhanced reliability
export async function waitForFrameProcessing(connection, options = {}) {
  const {
    timeout = 100,
    maxIterations = 10,
    checkConnection = true
  } = options;
  
  // Allow multiple event loop cycles for async processing
  await new Promise(resolve => process.nextTick(resolve));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  
  // Additional timing for frame parsing if specified
  if (timeout > 0) {
    await new Promise(resolve => setTimeout(resolve, timeout));
  }
  
  // Check connection state if requested
  if (checkConnection && connection) {
    let iterations = 0;
    while (connection.bufferList && connection.bufferList.length > 0 && iterations < maxIterations) {
      await new Promise(resolve => setTimeout(resolve, 10));
      iterations++;
    }
  }
}

// Generate frames with proper client/server masking conventions
export function generateClientFrame(options = {}) {
  return generateWebSocketFrame({
    ...options,
    masked: true // Client frames must be masked
  });
}

export function generateServerFrame(options = {}) {
  return generateWebSocketFrame({
    ...options,
    masked: false // Server frames must not be masked
  });
}

// Generate sequence of frames for complex scenarios
export function generateFrameSequence(frames) {
  const sequence = [];
  
  for (const frameOptions of frames) {
    sequence.push(generateWebSocketFrame(frameOptions));
  }
  
  return sequence;
}