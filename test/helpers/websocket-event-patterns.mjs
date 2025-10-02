import { expect, vi } from 'vitest';
import {
  captureEvents,
  waitForEvent,
  waitForEventWithPayload,
  waitForEventSequence,
  waitForMultipleEvents
} from './test-utils.mjs';
import {
  expectEventSequenceAsync,
  expectEventWithPayload,
  expectNoEvent,
  expectWebSocketConnectionStateTransition,
  expectWebSocketMessageEvent,
  expectWebSocketFrameEvent,
  expectWebSocketProtocolError
} from './assertions.mjs';
import { generateWebSocketFrame } from './generators.mjs';

/**
 * WebSocket-Specific Event Testing Patterns for Phase 3.2.A.3.2
 * 
 * This module provides standardized event testing patterns for WebSocket connections,
 * designed to work with the existing WebSocket-Node implementation.
 */

// ============================================================================
// Connection State Event Patterns
// ============================================================================

/**
 * Test pattern for connection establishment events
 */
export function createConnectionEstablishmentPattern(connection, options = {}) {
  const { validateEvents = true, timeout = 5000 } = options;
  
  return {
    /**
     * Test that connection properly initializes with correct state
     */
    async testInitialState() {
      expect(connection.state).toBe('open');
      expect(connection.connected).toBe(true);
      expect(connection.closeReasonCode).toBe(-1);
      expect(connection.closeDescription).toBe(null);
      expect(connection.closeEventEmitted).toBe(false);
    },
    
    /**
     * Validate that no unexpected events are emitted during normal initialization
     */
    async testNoUnexpectedEvents() {
      const forbiddenEvents = ['error', 'close'];
      const promises = forbiddenEvents.map(eventName => 
        expectNoEvent(connection, eventName, 100)
      );
      await Promise.all(promises);
    }
  };
}

/**
 * Test pattern for connection close events
 */
export function createConnectionClosePattern(connection, mockSocket, options = {}) {
  const { 
    validateEvents = true, 
    timeout = 5000,
    expectedCloseCode = 1000,
    expectedDescription = ''
  } = options;
  
  return {
    /**
     * Test graceful close initiated by connection
     */
    async testGracefulClose() {
      const closePromise = waitForEvent(connection, 'close', timeout);
      
      connection.close(expectedCloseCode, expectedDescription);
      
      const [reasonCode, description] = await closePromise;
      expect(reasonCode).toBe(expectedCloseCode);
      expect(description).toBe(expectedDescription);
      expect(connection.state).toBe('closed');
      expect(connection.connected).toBe(false);
    },
    
    /**
     * Test close sequence with proper event order
     */
    async testCloseSequence() {
      const sequence = [];
      
      connection.on('close', (reasonCode, description) => {
        sequence.push({ event: 'close', reasonCode, description });
      });
      
      connection.close(expectedCloseCode, expectedDescription);
      
      // Wait for close to complete
      await waitForEvent(connection, 'close', timeout);
      
      expect(sequence).toHaveLength(1);
      expect(sequence[0].event).toBe('close');
      expect(sequence[0].reasonCode).toBe(expectedCloseCode);
    },
    
    /**
     * Test connection state transitions during close
     */
    async testCloseStateTransition() {
      expect(connection.state).toBe('open');
      
      const stateTransitionPromise = expectWebSocketConnectionStateTransition(
        connection, 'open', 'closed', { timeout }
      );
      
      connection.close(expectedCloseCode, expectedDescription);
      
      await stateTransitionPromise;
      expect(connection.state).toBe('closed');
    }
  };
}

/**
 * Test pattern for connection error events
 */
export function createConnectionErrorPattern(connection, mockSocket, options = {}) {
  const { validateEvents = true, timeout = 5000 } = options;
  
  return {
    /**
     * Test error event emission with proper payload
     */
    async testErrorEvent(errorMessage = 'Test error') {
      const errorPromise = waitForEvent(connection, 'error', { timeout });
      
      // Simulate socket error
      mockSocket.emit('error', new Error(errorMessage));
      
      const [error] = await errorPromise;
      expect(error).toBeDefined();
      expect(error.message).toContain(errorMessage);
    },
    
    /**
     * Test error leading to connection close
     */
    async testErrorCloseSequence(errorMessage = 'Fatal error') {
      const eventSequence = captureEvents(connection, ['error', 'close'], {
        trackSequence: true
      });
      
      mockSocket.emit('error', new Error(errorMessage));
      
      // Wait for both events
      await waitForMultipleEvents(connection, ['error', 'close'], { timeout });
      
      const sequence = eventSequence.getSequence();
      expect(sequence).toHaveLength(2);
      expect(sequence[0].eventName).toBe('error');
      expect(sequence[1].eventName).toBe('close');
      
      eventSequence.cleanup();
    }
  };
}

// ============================================================================
// Message and Frame Event Patterns
// ============================================================================

/**
 * Test pattern for message events
 */
export function createMessageEventPattern(connection, mockSocket, options = {}) {
  const { validatePayload = true, timeout = 5000 } = options;
  
  return {
    /**
     * Test text message event
     */
    async testTextMessageEvent(messageText = 'Hello, WebSocket!') {
      const messagePromise = expectWebSocketMessageEvent(
        connection,
        messageText,
        { messageType: 'utf8', timeout }
      );
      
      const textFrame = generateWebSocketFrame({
        opcode: 0x01, // Text frame
        payload: messageText,
        masked: true
      });
      
      mockSocket.emit('data', textFrame);
      
      const message = await messagePromise;
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe(messageText);
    },
    
    /**
     * Test binary message event
     */
    async testBinaryMessageEvent(binaryData = Buffer.from([1, 2, 3, 4])) {
      const messagePromise = expectWebSocketMessageEvent(
        connection,
        binaryData,
        { messageType: 'binary', timeout }
      );
      
      const binaryFrame = generateWebSocketFrame({
        opcode: 0x02, // Binary frame
        payload: binaryData,
        masked: true
      });
      
      mockSocket.emit('data', binaryFrame);
      
      const message = await messagePromise;
      expect(message.type).toBe('binary');
      expect(message.binaryData.equals(binaryData)).toBe(true);
    },
    
    /**
     * Test fragmented message assembly
     */
    async testFragmentedMessageEvent(fullMessage = 'This is a fragmented message') {
      const firstPart = fullMessage.substring(0, 10);
      const secondPart = fullMessage.substring(10);
      
      const messagePromise = expectWebSocketMessageEvent(
        connection,
        fullMessage,
        { messageType: 'utf8', timeout }
      );
      
      // Send first fragment (FIN=0)
      const firstFragment = generateWebSocketFrame({
        fin: false,
        opcode: 0x01, // Text frame
        payload: firstPart,
        masked: true
      });
      
      // Send continuation fragment (FIN=1)
      const secondFragment = generateWebSocketFrame({
        fin: true,
        opcode: 0x00, // Continuation frame
        payload: secondPart,
        masked: true
      });
      
      mockSocket.emit('data', firstFragment);
      // Small delay to ensure proper processing order
      setTimeout(() => mockSocket.emit('data', secondFragment), 10);
      
      const message = await messagePromise;
      expect(message.utf8Data).toBe(fullMessage);
    }
  };
}

/**
 * Test pattern for frame events (when assembleFragments: false)
 */
export function createFrameEventPattern(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Test individual frame events
     */
    async testFrameEvent(frameType = 0x01, payload = 'frame data') {
      const framePromise = waitForEvent(connection, 'frame', { timeout });
      
      const frame = generateWebSocketFrame({
        opcode: frameType,
        payload: payload,
        masked: true
      });
      
      mockSocket.emit('data', frame);
      
      const [receivedFrame] = await framePromise;
      expect(receivedFrame.opcode).toBe(frameType);
      
      // Check payload based on frame type
      if (frameType === 0x01) { // Text frame
        expect(receivedFrame.utf8Data).toBe(payload);
      } else if (frameType === 0x02) { // Binary frame
        expect(Buffer.isBuffer(receivedFrame.binaryPayload)).toBe(true);
      }
    },
    
    /**
     * Test frame sequence without assembly
     */
    async testFrameSequence() {
      const frameCapture = captureEvents(connection, ['frame'], {
        trackSequence: true
      });
      
      const frames = [
        { opcode: 0x01, payload: 'first', fin: false },
        { opcode: 0x00, payload: 'second', fin: true }
      ];
      
      for (const frameData of frames) {
        const frame = generateWebSocketFrame({
          fin: frameData.fin,
          opcode: frameData.opcode,
          payload: frameData.payload,
          masked: true
        });
        mockSocket.emit('data', frame);
      }
      
      // Wait for both frames
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const capturedFrames = frameCapture.getEvents('frame');
      expect(capturedFrames).toHaveLength(2);
      
      frameCapture.cleanup();
    }
  };
}

// ============================================================================
// Control Frame Event Patterns
// ============================================================================

/**
 * Test pattern for control frame events (ping, pong, close)
 */
export function createControlFramePattern(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Test ping frame handling and automatic pong response
     */
    async testPingPongSequence(pingData = Buffer.from('ping-data')) {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
      
      const pingFrame = generateWebSocketFrame({
        opcode: 0x09, // Ping
        payload: pingData,
        masked: true
      });
      
      mockSocket.emit('data', pingFrame);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should have automatically sent a pong response
      expect(writeSpy).toHaveBeenCalled();
      
      const pongFrame = writeSpy.mock.calls.find(call => {
        const data = call[0];
        return data && data[0] === 0x8A; // Pong opcode with FIN
      });
      
      expect(pongFrame).toBeDefined();
      writeSpy.mockRestore();
    },
    
    /**
     * Test close frame handling
     */
    async testCloseFrameHandling(closeCode = 1000, closeReason = 'Normal closure') {
      const closePromise = waitForEvent(connection, 'close', timeout);
      
      // Create close payload with proper format
      const reasonBytes = Buffer.from(closeReason, 'utf8');
      const closePayload = Buffer.alloc(2 + reasonBytes.length);
      closePayload.writeUInt16BE(closeCode, 0);
      reasonBytes.copy(closePayload, 2);
      
      const closeFrame = generateWebSocketFrame({
        opcode: 0x08, // Close
        payload: closePayload,
        masked: true
      });
      
      mockSocket.emit('data', closeFrame);
      
      const [receivedCloseCode, receivedReason] = await closePromise;
      expect(receivedCloseCode).toBe(closeCode);
      expect(receivedReason).toBe(closeReason);
    },
    
    /**
     * Test pong frame reception (response to our ping)
     */
    async testPongReception() {
      const eventCapture = captureEvents(connection, ['pong'], {
        includeTimestamps: true
      });
      
      const pongFrame = generateWebSocketFrame({
        opcode: 0x0A, // Pong
        payload: Buffer.from('pong-response'),
        masked: true
      });
      
      mockSocket.emit('data', pongFrame);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const pongEvents = eventCapture.getEvents('pong');
      expect(pongEvents).toHaveLength(1);
      
      eventCapture.cleanup();
    }
  };
}

// ============================================================================
// Protocol Compliance Error Event Patterns
// ============================================================================

/**
 * Test pattern for protocol violation error events
 */
export function createProtocolErrorPattern(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Test reserved opcode error
     */
    async testReservedOpcodeError() {
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'reserved opcode',
        { timeout, validateCloseCode: true }
      );
      
      const invalidFrame = generateWebSocketFrame({
        opcode: 0x05, // Reserved opcode
        payload: 'invalid',
        masked: true
      });
      
      mockSocket.emit('data', invalidFrame);
      
      await errorPromise;
    },
    
    /**
     * Test RSV bit violation error
     */
    async testRSVBitError() {
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'RSV',
        { timeout }
      );
      
      // Create frame with RSV1 bit set (invalid without extension)
      const buffer = Buffer.alloc(6);
      buffer[0] = 0x81 | 0x40; // Text frame with RSV1 set
      buffer[1] = 0x80 | 0x01; // Masked, 1 byte payload
      // Masking key
      buffer[2] = 0x00;
      buffer[3] = 0x00;
      buffer[4] = 0x00;
      buffer[5] = 0x00;
      
      mockSocket.emit('data', buffer);
      
      await errorPromise;
    },
    
    /**
     * Test control frame size violation
     */
    async testControlFrameSizeError() {
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'control frame',
        { timeout }
      );
      
      // Create oversized ping frame (>125 bytes)
      const largePayload = Buffer.alloc(126, 0x41); // 126 'A' characters
      const oversizedPing = generateWebSocketFrame({
        opcode: 0x09, // Ping
        payload: largePayload,
        masked: true
      });
      
      mockSocket.emit('data', oversizedPing);
      
      await errorPromise;
    },
    
    /**
     * Test invalid UTF-8 in text frame error
     */
    async testInvalidUTF8Error() {
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'UTF-8',
        { timeout }
      );
      
      // Create text frame with invalid UTF-8
      const invalidUTF8 = Buffer.from([0xFF, 0xFE, 0xFD]);
      const invalidFrame = generateWebSocketFrame({
        opcode: 0x01, // Text frame
        payload: invalidUTF8,
        masked: true
      });
      
      mockSocket.emit('data', invalidFrame);
      
      await errorPromise;
    }
  };
}

// ============================================================================
// Size Limit Error Event Patterns
// ============================================================================

/**
 * Test pattern for size limit enforcement events
 */
export function createSizeLimitPattern(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Test maxReceivedFrameSize enforcement
     */
    async testFrameSizeLimit(maxFrameSize = 1024) {
      // Update connection config
      connection.maxReceivedFrameSize = maxFrameSize;
      
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'frame size',
        { timeout }
      );
      
      // Create frame larger than limit
      const largePayload = Buffer.alloc(maxFrameSize + 1, 0x41);
      const oversizedFrame = generateWebSocketFrame({
        opcode: 0x01, // Text frame
        payload: largePayload,
        masked: true
      });
      
      mockSocket.emit('data', oversizedFrame);
      
      await errorPromise;
    },
    
    /**
     * Test maxReceivedMessageSize enforcement
     */
    async testMessageSizeLimit(maxMessageSize = 2048) {
      // Update connection config
      connection.maxReceivedMessageSize = maxMessageSize;
      
      const errorPromise = expectWebSocketProtocolError(
        connection,
        'message size',
        { timeout }
      );
      
      // Create message larger than limit via fragmentation
      const fragmentSize = 1000;
      const totalSize = maxMessageSize + 100;
      
      // First fragment
      const firstFragment = generateWebSocketFrame({
        fin: false,
        opcode: 0x01, // Text frame
        payload: Buffer.alloc(fragmentSize, 0x41),
        masked: true
      });
      
      // Second fragment (makes total exceed limit)
      const secondFragment = generateWebSocketFrame({
        fin: true,
        opcode: 0x00, // Continuation
        payload: Buffer.alloc(totalSize - fragmentSize, 0x42),
        masked: true
      });
      
      mockSocket.emit('data', firstFragment);
      setTimeout(() => mockSocket.emit('data', secondFragment), 10);
      
      await errorPromise;
    }
  };
}

// ============================================================================
// Combined Pattern Utilities
// ============================================================================

/**
 * Create a comprehensive WebSocket event testing suite for a connection
 */
export function createWebSocketEventTestSuite(connection, mockSocket, options = {}) {
  return {
    connectionPatterns: createConnectionEstablishmentPattern(connection, options),
    closePatterns: createConnectionClosePattern(connection, mockSocket, options),
    errorPatterns: createConnectionErrorPattern(connection, mockSocket, options),
    messagePatterns: createMessageEventPattern(connection, mockSocket, options),
    framePatterns: createFrameEventPattern(connection, mockSocket, options),
    controlPatterns: createControlFramePattern(connection, mockSocket, options),
    protocolErrorPatterns: createProtocolErrorPattern(connection, mockSocket, options),
    sizeLimitPatterns: createSizeLimitPattern(connection, mockSocket, options)
  };
}

/**
 * Validate WebSocket connection event behavior with comprehensive patterns
 */
export async function validateWebSocketEventBehavior(connection, mockSocket, testScenarios = []) {
  const suite = createWebSocketEventTestSuite(connection, mockSocket);
  const results = [];
  
  for (const scenario of testScenarios) {
    try {
      const pattern = suite[scenario.pattern];
      if (pattern && pattern[scenario.test]) {
        await pattern[scenario.test](...(scenario.args || []));
        results.push({ scenario: scenario.name, status: 'passed' });
      } else {
        results.push({ scenario: scenario.name, status: 'skipped', reason: 'Pattern not found' });
      }
    } catch (error) {
      results.push({ scenario: scenario.name, status: 'failed', error: error.message });
    }
  }
  
  return results;
}