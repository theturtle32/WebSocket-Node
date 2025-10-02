import { EventEmitter } from 'events';
import { 
  generateWebSocketFrame, 
  injectFrameIntoConnection, 
  waitForFrameProcessing,
  generateClientFrame,
  generateServerFrame
} from './generators.mjs';

/**
 * Enhanced frame processing utilities for WebSocket connection testing
 * 
 * This module provides reliable patterns for testing WebSocket frame processing,
 * with proper async coordination and event handling.
 */

/**
 * FrameProcessor - Manages frame injection and processing coordination
 */
export class FrameProcessor {
  constructor(connection) {
    this.connection = connection;
    this.events = new EventEmitter();
    this.frameQueue = [];
    this.processing = false;
    this.defaultTimeout = 1000;
  }

  /**
   * Inject a single frame and wait for processing
   */
  async injectFrame(frameOptions, processingOptions = {}) {
    const frame = generateWebSocketFrame(frameOptions);
    
    // Set up event listeners before injecting
    const eventPromises = this.setupEventListeners(processingOptions);
    
    // Inject the frame
    await injectFrameIntoConnection(this.connection, frame, processingOptions);
    
    // Wait for processing
    await waitForFrameProcessing(this.connection, processingOptions);
    
    // Return captured events
    return eventPromises;
  }

  /**
   * Inject a sequence of frames with proper timing
   */
  async injectFrameSequence(frameOptionsArray, processingOptions = {}) {
    const results = [];
    
    for (const frameOptions of frameOptionsArray) {
      const result = await this.injectFrame(frameOptions, {
        ...processingOptions,
        timeout: processingOptions.sequenceDelay || 10
      });
      results.push(result);
      
      // Small delay between frames if specified
      if (processingOptions.sequenceDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, processingOptions.sequenceDelay));
      }
    }
    
    return results;
  }

  /**
   * Set up event listeners for frame processing
   */
  setupEventListeners(options = {}) {
    const { expectEvents = [], timeout = this.defaultTimeout } = options;
    const eventPromises = {};
    
    for (const eventName of expectEvents) {
      eventPromises[eventName] = this.waitForEvent(eventName, timeout);
    }
    
    return eventPromises;
  }

  /**
   * Wait for a specific event with timeout
   */
  waitForEvent(eventName, timeout = this.defaultTimeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.connection.removeListener(eventName, handler);
        reject(new Error(`Event '${eventName}' not emitted within ${timeout}ms`));
      }, timeout);

      const handler = (...args) => {
        clearTimeout(timeoutId);
        resolve(args);
      };

      this.connection.once(eventName, handler);
    });
  }

  /**
   * Wait for multiple events with timeout
   */
  async waitForEvents(eventNames, timeout = this.defaultTimeout) {
    const eventPromises = eventNames.map(name => this.waitForEvent(name, timeout));
    
    try {
      const results = await Promise.all(eventPromises);
      return eventNames.reduce((acc, name, index) => {
        acc[name] = results[index];
        return acc;
      }, {});
    } catch (error) {
      // Clean up any remaining listeners
      eventNames.forEach(name => {
        this.connection.removeAllListeners(name);
      });
      throw error;
    }
  }

  /**
   * Capture events during frame processing
   */
  async captureEvents(frameOptions, expectedEvents = [], timeout = this.defaultTimeout) {
    const eventPromises = this.waitForEvents(expectedEvents, timeout);
    
    // Inject frame
    const frame = generateWebSocketFrame(frameOptions);
    await injectFrameIntoConnection(this.connection, frame);
    
    // Wait for processing
    await waitForFrameProcessing(this.connection);
    
    try {
      return await eventPromises;
    } catch (error) {
      // Return partial results if some events were captured
      return { error: error.message };
    }
  }
}

/**
 * Test patterns for common WebSocket scenarios
 */
export class WebSocketTestPatterns {
  constructor(connection) {
    this.connection = connection;
    this.processor = new FrameProcessor(connection);
  }

  /**
   * Test text message exchange
   */
  async testTextMessage(message = 'Hello World') {
    const frame = generateClientFrame({
      opcode: 0x1,
      payload: message
    });

    const events = await this.processor.captureEvents(frame, ['message'], 1000);
    
    if (events.error) {
      throw new Error(`Text message test failed: ${events.error}`);
    }
    
    return events.message[0]; // Return the message event args
  }

  /**
   * Test binary message exchange
   */
  async testBinaryMessage(data = Buffer.from('Binary data')) {
    const frame = generateClientFrame({
      opcode: 0x2,
      payload: data
    });

    const events = await this.processor.captureEvents(frame, ['message'], 1000);
    
    if (events.error) {
      throw new Error(`Binary message test failed: ${events.error}`);
    }
    
    return events.message[0]; // Return the message event args
  }

  /**
   * Test fragmented message assembly
   */
  async testFragmentedMessage(message = 'Hello World', fragmentSizes = [5, 6]) {
    const messageBuffer = Buffer.from(message, 'utf8');
    const frames = [];
    let offset = 0;

    for (let i = 0; i < fragmentSizes.length; i++) {
      const isFirst = i === 0;
      const isLast = i === fragmentSizes.length - 1 || offset + fragmentSizes[i] >= messageBuffer.length;
      const fragmentSize = Math.min(fragmentSizes[i], messageBuffer.length - offset);
      
      const fragment = messageBuffer.subarray(offset, offset + fragmentSize);
      const opcode = isFirst ? 0x1 : 0x0; // Text frame for first, continuation for rest
      
      frames.push({
        opcode,
        fin: isLast,
        payload: fragment,
        masked: true
      });
      
      offset += fragmentSize;
      if (offset >= messageBuffer.length) break;
    }

    const events = await this.processor.captureEvents(frames[0], ['message'], 2000);
    
    // Inject remaining frames
    for (let i = 1; i < frames.length; i++) {
      await this.processor.injectFrame(frames[i], { timeout: 100 });
    }
    
    // Wait for final processing
    await waitForFrameProcessing(this.connection, { timeout: 500 });
    
    if (events.error) {
      throw new Error(`Fragmented message test failed: ${events.error}`);
    }
    
    return events.message[0]; // Return the assembled message
  }

  /**
   * Test ping-pong exchange
   */
  async testPingPong(pingData = 'ping') {
    const pingFrame = generateClientFrame({
      opcode: 0x9,
      payload: pingData
    });

    // Capture both ping event and pong frame being sent
    const events = await this.processor.captureEvents(pingFrame, ['ping'], 1000);
    
    if (events.error) {
      throw new Error(`Ping-pong test failed: ${events.error}`);
    }
    
    return events.ping[0]; // Return ping event args
  }

  /**
   * Test protocol violation detection
   */
  async testProtocolViolation(violationType = 'reserved_opcode') {
    let frame;
    
    switch (violationType) {
      case 'reserved_opcode':
        frame = generateClientFrame({
          opcode: 0x6, // Reserved opcode
          payload: 'test',
          validate: false // Skip validation to allow reserved opcode
        });
        break;
      
      case 'rsv_bits':
        frame = generateClientFrame({
          rsv1: true,
          rsv2: true,
          rsv3: true,
          payload: 'test'
        });
        break;
      
      case 'fragmented_control':
        frame = generateClientFrame({
          opcode: 0x8, // Close frame
          fin: false, // Fragmented control frame is invalid
          payload: Buffer.from([0x03, 0xe8])
        });
        break;
      
      default:
        throw new Error(`Unknown violation type: ${violationType}`);
    }

    const events = await this.processor.captureEvents(frame, ['error', 'close'], 1000);
    
    return events;
  }

  /**
   * Test size limit enforcement
   */
  async testSizeLimit(limitType = 'frame', size = 1024 * 1024) {
    let frame;
    
    if (limitType === 'frame') {
      const largePayload = Buffer.alloc(size, 'A');
      frame = generateClientFrame({
        payload: largePayload
      });
    } else {
      // Test message size limit with multiple frames
      const largeMessage = 'A'.repeat(size);
      frame = generateClientFrame({
        payload: largeMessage
      });
    }

    const events = await this.processor.captureEvents(frame, ['error', 'close'], 2000);
    
    return events;
  }

  /**
   * Test connection close handling
   */
  async testConnectionClose(closeCode = 1000, closeReason = 'Normal closure') {
    const closePayload = Buffer.alloc(2 + Buffer.byteLength(closeReason, 'utf8'));
    closePayload.writeUInt16BE(closeCode, 0);
    closePayload.write(closeReason, 2, 'utf8');

    const closeFrame = generateClientFrame({
      opcode: 0x8,
      payload: closePayload
    });

    const events = await this.processor.captureEvents(closeFrame, ['close'], 1000);
    
    if (events.error) {
      throw new Error(`Connection close test failed: ${events.error}`);
    }
    
    return events.close[0]; // Return close event args
  }
}

/**
 * Advanced frame processing utilities for edge cases
 */
export class AdvancedFrameProcessing {
  constructor(connection) {
    this.connection = connection;
    this.processor = new FrameProcessor(connection);
  }

  /**
   * Test partial frame reception
   */
  async testPartialFrameReception(frameOptions, chunkSizes = [1, 2, 3]) {
    const frame = generateWebSocketFrame(frameOptions);
    
    // Send frame in chunks
    let offset = 0;
    for (const chunkSize of chunkSizes) {
      if (offset >= frame.length) break;
      
      const chunk = frame.subarray(offset, Math.min(offset + chunkSize, frame.length));
      this.connection.socket.emit('data', chunk);
      
      // Small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 10));
      
      offset += chunk.length;
    }
    
    // Send remaining data if any
    if (offset < frame.length) {
      const remainingChunk = frame.subarray(offset);
      this.connection.socket.emit('data', remainingChunk);
    }
    
    // Wait for processing
    await waitForFrameProcessing(this.connection, { timeout: 500 });
  }

  /**
   * Test interleaved frame processing
   */
  async testInterleavedFrames(frameSequences) {
    const results = [];
    
    // Interleave frames from different sequences
    const maxLength = Math.max(...frameSequences.map(seq => seq.length));
    
    for (let i = 0; i < maxLength; i++) {
      for (const sequence of frameSequences) {
        if (i < sequence.length) {
          await this.processor.injectFrame(sequence[i], { timeout: 50 });
          results.push({ sequence: frameSequences.indexOf(sequence), frame: i });
        }
      }
    }
    
    return results;
  }

  /**
   * Test frame processing under load
   */
  async testFrameProcessingLoad(frameOptions, count = 100) {
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < count; i++) {
      const frame = generateWebSocketFrame({
        ...frameOptions,
        payload: `Message ${i}`
      });
      
      // Don't wait for processing to simulate load
      this.connection.socket.emit('data', frame);
      
      if (i % 10 === 0) {
        // Periodic processing wait to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    // Final processing wait
    await waitForFrameProcessing(this.connection, { timeout: 2000 });
    
    const endTime = Date.now();
    
    return {
      count,
      duration: endTime - startTime,
      avgPerFrame: (endTime - startTime) / count
    };
  }
}

/**
 * Utility function to create test patterns for a connection
 */
export function createTestPatterns(connection) {
  return {
    processor: new FrameProcessor(connection),
    patterns: new WebSocketTestPatterns(connection),
    advanced: new AdvancedFrameProcessing(connection)
  };
}

/**
 * Helper function to validate frame processing results
 */
export function validateFrameProcessingResults(results, expected) {
  const errors = [];
  
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!(key in results)) {
      errors.push(`Missing expected result: ${key}`);
      continue;
    }
    
    const actualValue = results[key];
    
    if (typeof expectedValue === 'object' && expectedValue !== null) {
      // Deep comparison for objects
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        errors.push(`Mismatch for ${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    } else {
      // Simple comparison for primitives
      if (actualValue !== expectedValue) {
        errors.push(`Mismatch for ${key}: expected ${expectedValue}, got ${actualValue}`);
      }
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Frame processing validation failed:\n${errors.join('\n')}`);
  }
  
  return true;
}