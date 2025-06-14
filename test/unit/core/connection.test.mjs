import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import WebSocketConnection from '../../../lib/WebSocketConnection.js';
import { MockSocket, MockWebSocketConnection } from '../../helpers/mocks.mjs';
import { generateWebSocketFrame, generateRandomPayload } from '../../helpers/generators.mjs';
import { expectConnectionState, expectBufferEquals } from '../../helpers/assertions.mjs';

describe('WebSocketConnection - Comprehensive Testing', () => {
  let mockSocket, config, connection;
  
  beforeEach(() => {
    mockSocket = new MockSocket();
    config = {
      maxReceivedFrameSize: 64 * 1024 * 1024, // 64MB
      maxReceivedMessageSize: 64 * 1024 * 1024, // 64MB
      assembleFragments: true,
      fragmentOutgoingMessages: true,
      fragmentationThreshold: 16 * 1024, // 16KB
      disableNagleAlgorithm: true,
      closeTimeout: 5000,
      keepalive: false,
      useNativeKeepalive: false
    };
  });

  afterEach(() => {
    if (connection && connection.state !== 'closed') {
      connection.drop();
    }
    vi.clearAllTimers();
  });

  describe('Connection Lifecycle', () => {
    describe('Connection Establishment', () => {
      it('should initialize connection with proper state', () => {
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        
        expect(connection.socket).toBe(mockSocket);
        expect(connection.protocol).toBe('test-protocol');
        expect(connection.extensions).toEqual([]);
        expect(connection.maskOutgoingPackets).toBe(true);
        expect(connection.connected).toBe(true);
        expect(connection.state).toBe('open');
        expect(connection.closeReasonCode).toBe(-1);
        expect(connection.closeDescription).toBe(null);
        expect(connection.closeEventEmitted).toBe(false);
      });

      it('should set up socket event listeners on creation', () => {
        const eventSpy = vi.spyOn(mockSocket, 'on');
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        connection._addSocketEventListeners();

        expect(eventSpy).toHaveBeenCalledWith('error', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('end', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('close', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('drain', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('pause', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('resume', expect.any(Function));
        expect(eventSpy).toHaveBeenCalledWith('data', expect.any(Function));
      });

      it('should configure socket settings correctly', () => {
        const setNoDelaySpy = vi.spyOn(mockSocket, 'setNoDelay');
        const setTimeoutSpy = vi.spyOn(mockSocket, 'setTimeout');
        
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        
        expect(setNoDelaySpy).toHaveBeenCalledWith(true);
        expect(setTimeoutSpy).toHaveBeenCalledWith(0);
      });

      it('should handle extension and protocol negotiation', () => {
        const extensions = ['permessage-deflate'];
        connection = new WebSocketConnection(mockSocket, extensions, 'custom-protocol', false, config);
        
        expect(connection.extensions).toBe(extensions);
        expect(connection.protocol).toBe('custom-protocol');
        expect(connection.maskOutgoingPackets).toBe(false);
      });

      it('should track remote address from socket', () => {
        mockSocket.remoteAddress = '192.168.1.100';
        connection = new WebSocketConnection(mockSocket, [], null, true, config);
        
        expect(connection.remoteAddress).toBe('192.168.1.100');
      });

      it('should remove existing socket error listeners', () => {
        const removeAllListenersSpy = vi.spyOn(mockSocket, 'removeAllListeners');
        connection = new WebSocketConnection(mockSocket, [], null, true, config);
        
        expect(removeAllListenersSpy).toHaveBeenCalledWith('error');
      });
    });

    describe('Connection State Transitions', () => {
      beforeEach(() => {
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        connection._addSocketEventListeners();
      });

      it('should start in open state', () => {
        expectConnectionState(connection, 'open');
        expect(connection.connected).toBe(true);
        expect(connection.waitingForCloseResponse).toBe(false);
      });

      it('should transition to ending state when close() is called', () => {
        connection.close(1000, 'Normal closure');
        
        expectConnectionState(connection, 'ending');
        expect(connection.waitingForCloseResponse).toBe(true);
      });

      it('should transition to peer_requested_close when receiving close frame', async () => {
        const statusCode = Buffer.alloc(2);
        statusCode.writeUInt16BE(1000, 0);
        const reason = Buffer.from('Client closing');
        const payload = Buffer.concat([statusCode, reason]);
        
        const closeFrame = generateWebSocketFrame({
          opcode: 0x08, // Close frame
          payload,
          masked: true
        });

        mockSocket.emit('data', closeFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expectConnectionState(connection, 'peer_requested_close');
      });

      it('should transition to closed state after proper close sequence', async () => {
        const closedPromise = new Promise((resolve) => {
          connection.once('close', resolve);
        });

        // Initiate close
        connection.close(1000, 'Normal closure');
        expect(connection.state).toBe('ending');

        // Simulate receiving close response
        const closeResponse = generateWebSocketFrame({
          opcode: 0x08,
          payload: Buffer.alloc(2).writeUInt16BE(1000, 0),
          masked: true
        });
        mockSocket.emit('data', closeResponse);

        // Simulate socket close
        mockSocket.emit('close');

        await closedPromise;
        expectConnectionState(connection, 'closed');
        expect(connection.connected).toBe(false);
      });

      it('should handle abrupt socket close', async () => {
        const closedPromise = new Promise((resolve) => {
          connection.once('close', resolve);
        });

        mockSocket.emit('close');
        
        await closedPromise;
        expectConnectionState(connection, 'closed');
        expect(connection.connected).toBe(false);
      });

      it('should prevent state changes after closed', () => {
        connection.state = 'closed';
        connection.connected = false;
        
        expect(() => connection.close()).not.toThrow();
        expect(connection.state).toBe('closed');
      });
    });

    describe('Connection Close Handling', () => {
      beforeEach(() => {
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        connection._addSocketEventListeners();
      });

      it('should handle graceful close with valid reason codes', () => {
        const validCodes = [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 3000, 4000];
        
        validCodes.forEach(code => {
          const testConnection = new WebSocketConnection(new MockSocket(), [], 'test', true, config);
          expect(() => testConnection.close(code, 'Test closure')).not.toThrow();
          expect(testConnection.state).toBe('ending');
        });
      });

      it('should reject invalid close reason codes', () => {
        const invalidCodes = [500, 999, 1004, 1005, 1006, 2000, 5000];
        
        invalidCodes.forEach(code => {
          expect(() => connection.close(code, 'Invalid code')).toThrow(/Close code .* is not valid/);
        });
      });

      it('should handle close without reason code', () => {
        expect(() => connection.close()).not.toThrow();
        expect(connection.state).toBe('ending');
      });

      it('should handle close with only reason code', () => {
        expect(() => connection.close(1000)).not.toThrow();
        expect(connection.state).toBe('ending');
      });

      it('should emit close event only once', async () => {
        let closeCount = 0;
        connection.on('close', () => closeCount++);

        connection.drop();
        connection.drop(); // Second call should not emit another event
        
        // Wait for any potential delayed events
        await new Promise(resolve => setImmediate(resolve));
        
        expect(closeCount).toBe(1);
        expect(connection.closeEventEmitted).toBe(true);
      });

      it('should handle drop with reason code and description', () => {
        connection.drop(1002, 'Protocol error', true);
        
        expect(connection.state).toBe('closed');
        expect(connection.closeReasonCode).toBe(1002);
        expect(connection.closeDescription).toBe('Protocol error');
      });

      it('should send close frame before dropping (when skipCloseFrame is false)', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write');
        connection.drop(1000, 'Normal closure', false);
        
        expect(writeSpy).toHaveBeenCalled();
        expect(connection.state).toBe('closed');
      });

      it('should skip close frame when skipCloseFrame is true', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write');
        connection.drop(1000, 'Normal closure', true);
        
        expect(writeSpy).not.toHaveBeenCalled();
        expect(connection.state).toBe('closed');
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
      connection._addSocketEventListeners();
    });

    describe('Text Message Send/Receive', () => {
      it('should send text message via sendUTF', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.sendUTF('Hello, WebSocket!');
        
        expect(writeSpy).toHaveBeenCalledOnce();
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData).toBeInstanceOf(Buffer);
        
        // Check frame structure (masked, text opcode)
        expect(writtenData[0]).toBe(0x81); // FIN + text opcode
        expect(writtenData[1] & 0x80).toBe(0x80); // Mask bit set
      });

      it('should receive and emit text message correctly', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const textFrame = generateWebSocketFrame({
          opcode: 0x01,
          payload: 'Hello from client!',
          masked: true
        });

        mockSocket.emit('data', textFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('utf8');
        expect(receivedMessage.utf8Data).toBe('Hello from client!');
      });

      it('should handle UTF-8 validation in text frames', async () => {
        const invalidUTF8 = Buffer.from([0xFF, 0xFE, 0xFD]);
        const invalidFrame = generateWebSocketFrame({
          opcode: 0x01,
          payload: invalidUTF8,
          masked: true
        });

        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        mockSocket.emit('data', invalidFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should handle empty text message', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const emptyTextFrame = generateWebSocketFrame({
          opcode: 0x01,
          payload: '',
          masked: true
        });

        mockSocket.emit('data', emptyTextFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('utf8');
        expect(receivedMessage.utf8Data).toBe('');
      });

      it('should send text message with callback', (done) => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockImplementation((data, callback) => {
          if (callback) setImmediate(callback);
          return true;
        });

        connection.sendUTF('Test message', (error) => {
          expect(error).toBeUndefined();
          expect(writeSpy).toHaveBeenCalledOnce();
          done();
        });
      });
    });

    describe('Binary Message Send/Receive', () => {
      it('should send binary message via sendBytes', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
        
        connection.sendBytes(binaryData);
        
        expect(writeSpy).toHaveBeenCalledOnce();
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData[0]).toBe(0x82); // FIN + binary opcode
        expect(writtenData[1] & 0x80).toBe(0x80); // Mask bit set
      });

      it('should receive and emit binary message correctly', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const binaryData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
        const binaryFrame = generateWebSocketFrame({
          opcode: 0x02,
          payload: binaryData,
          masked: true
        });

        mockSocket.emit('data', binaryFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('binary');
        expect(receivedMessage.binaryData).toEqual(binaryData);
      });

      it('should handle large binary messages', async () => {
        const largeData = generateRandomPayload(100000, 'binary');
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const binaryFrame = generateWebSocketFrame({
          opcode: 0x02,
          payload: largeData,
          masked: true
        });

        mockSocket.emit('data', binaryFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('binary');
        expect(receivedMessage.binaryData).toEqual(largeData);
      });

      it('should send binary message with callback', (done) => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockImplementation((data, callback) => {
          if (callback) setImmediate(callback);
          return true;
        });

        const binaryData = Buffer.from('binary test data');
        connection.sendBytes(binaryData, (error) => {
          expect(error).toBeUndefined();
          expect(writeSpy).toHaveBeenCalledOnce();
          done();
        });
      });

      it('should handle empty binary message', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const emptyBinaryFrame = generateWebSocketFrame({
          opcode: 0x02,
          payload: Buffer.alloc(0),
          masked: true
        });

        mockSocket.emit('data', emptyBinaryFrame);
        
        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));
        
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('binary');
        expect(receivedMessage.binaryData).toEqual(Buffer.alloc(0));
      });
    });

    describe('Generic Send Method', () => {
      it('should delegate string to sendUTF', () => {
        const sendUTFSpy = vi.spyOn(connection, 'sendUTF');
        
        connection.send('Hello World');
        
        expect(sendUTFSpy).toHaveBeenCalledWith('Hello World', undefined);
      });

      it('should delegate Buffer to sendBytes', () => {
        const sendBytesSpy = vi.spyOn(connection, 'sendBytes');
        const buffer = Buffer.from('test');
        
        connection.send(buffer);
        
        expect(sendBytesSpy).toHaveBeenCalledWith(buffer, undefined);
      });

      it('should pass callback through to appropriate method', () => {
        const sendUTFSpy = vi.spyOn(connection, 'sendUTF');
        const callback = vi.fn();
        
        connection.send('test', callback);
        
        expect(sendUTFSpy).toHaveBeenCalledWith('test', callback);
      });

      it('should throw error for unsupported data types', () => {
        // Create object without toString method
        const invalidData = Object.create(null);
        expect(() => connection.send(invalidData)).toThrow('Data provided must either be a Node Buffer or implement toString()');
        
        // null doesn't have toString either
        expect(() => connection.send(null)).toThrow();
      });
    });

    describe('Fragmented Message Handling', () => {
      it('should assemble fragmented text message correctly', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        // Send fragmented message: "Hello" + " " + "World!"
        const firstFrame = generateWebSocketFrame({
          opcode: 0x01, // Text frame
          fin: false,   // Not final
          payload: 'Hello',
          masked: true
        });

        const contFrame = generateWebSocketFrame({
          opcode: 0x00, // Continuation frame
          fin: false,   // Not final  
          payload: ' ',
          masked: true
        });

        const finalFrame = generateWebSocketFrame({
          opcode: 0x00, // Continuation frame
          fin: true,    // Final
          payload: 'World!',
          masked: true
        });

        mockSocket.emit('data', firstFrame);
        await new Promise(resolve => setImmediate(resolve));
        expect(receivedMessage).toBeUndefined(); // Not complete yet

        mockSocket.emit('data', contFrame);
        await new Promise(resolve => setImmediate(resolve));
        expect(receivedMessage).toBeUndefined(); // Still not complete

        mockSocket.emit('data', finalFrame);
        await new Promise(resolve => setImmediate(resolve));
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('utf8');
        expect(receivedMessage.utf8Data).toBe('Hello World!');
      });

      it('should assemble fragmented binary message correctly', async () => {
        let receivedMessage;
        connection.on('message', (msg) => { receivedMessage = msg; });

        const part1 = Buffer.from([0x01, 0x02]);
        const part2 = Buffer.from([0x03, 0x04]);
        const part3 = Buffer.from([0x05, 0x06]);

        const firstFrame = generateWebSocketFrame({
          opcode: 0x02, // Binary frame
          fin: false,
          payload: part1,
          masked: true
        });

        const contFrame = generateWebSocketFrame({
          opcode: 0x00, // Continuation frame
          fin: false,
          payload: part2,
          masked: true
        });

        const finalFrame = generateWebSocketFrame({
          opcode: 0x00, // Continuation frame
          fin: true,
          payload: part3,
          masked: true
        });

        mockSocket.emit('data', firstFrame);
        await new Promise(resolve => setImmediate(resolve));
        
        mockSocket.emit('data', contFrame);
        await new Promise(resolve => setImmediate(resolve));
        
        mockSocket.emit('data', finalFrame);
        await new Promise(resolve => setImmediate(resolve));

        expect(receivedMessage).toBeDefined();
        expect(receivedMessage.type).toBe('binary');
        expect(receivedMessage.binaryData).toEqual(Buffer.concat([part1, part2, part3]));
      });

      it('should handle individual frames when assembleFragments is false', () => {
        const noAssembleConfig = { ...config, assembleFragments: false };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, noAssembleConfig);
        connection._addSocketEventListeners();

        const frames = [];
        connection.on('frame', (frame) => frames.push(frame));

        const firstFrame = generateWebSocketFrame({
          opcode: 0x01,
          fin: false,
          payload: 'Hello',
          masked: true
        });

        const finalFrame = generateWebSocketFrame({
          opcode: 0x00,
          fin: true,
          payload: ' World!',
          masked: true
        });

        mockSocket.emit('data', firstFrame);
        expect(frames).toHaveLength(1);
        expect(frames[0].opcode).toBe(0x01);

        mockSocket.emit('data', finalFrame);
        expect(frames).toHaveLength(2);
        expect(frames[1].opcode).toBe(0x00);
      });

      it('should enforce maximum message size for fragmented messages', () => {
        const smallConfig = { ...config, maxReceivedMessageSize: 10 };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, smallConfig);
        connection._addSocketEventListeners();

        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Send fragments that exceed the size limit
        const firstFrame = generateWebSocketFrame({
          opcode: 0x01,
          fin: false,
          payload: 'Hello',
          masked: true
        });

        const finalFrame = generateWebSocketFrame({
          opcode: 0x00,
          fin: true,
          payload: ' World! This exceeds the limit',
          masked: true
        });

        mockSocket.emit('data', firstFrame);
        mockSocket.emit('data', finalFrame);

        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should fragment outgoing large messages when enabled', () => {
        const fragmentConfig = { ...config, fragmentOutgoingMessages: true, fragmentationThreshold: 10 };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, fragmentConfig);
        
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        const longMessage = 'This is a very long message that should be fragmented into multiple frames';
        
        connection.sendUTF(longMessage);
        
        // Should have written multiple frames
        expect(writeSpy.mock.calls.length).toBeGreaterThan(1);
      });
    });

    describe('Control Frame Handling', () => {
      beforeEach(() => {
        connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
        connection._addSocketEventListeners();
      });

      it('should send ping frame', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.ping(Buffer.from('ping-data'));
        
        expect(writeSpy).toHaveBeenCalledOnce();
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData[0]).toBe(0x89); // FIN + ping opcode
      });

      it('should handle received ping frame and auto-respond with pong', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        const pingFrame = generateWebSocketFrame({
          opcode: 0x09, // Ping
          payload: Buffer.from('ping-data'),
          masked: true
        });

        mockSocket.emit('data', pingFrame);
        
        // Should automatically send pong response
        expect(writeSpy).toHaveBeenCalledOnce();
        const pongData = writeSpy.mock.calls[0][0];
        expect(pongData[0]).toBe(0x8A); // FIN + pong opcode
      });

      it('should emit ping event when listeners exist', () => {
        let pingReceived = false;
        let pingData;
        
        connection.on('ping', (cancelAutoResponse, data) => {
          pingReceived = true;
          pingData = data;
        });

        const pingFrame = generateWebSocketFrame({
          opcode: 0x09,
          payload: Buffer.from('custom-ping'),
          masked: true
        });

        mockSocket.emit('data', pingFrame);
        
        expect(pingReceived).toBe(true);
        expect(pingData).toEqual(Buffer.from('custom-ping'));
      });

      it('should allow canceling auto-pong response', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.on('ping', (cancelAutoResponse) => {
          cancelAutoResponse(); // Cancel automatic pong
        });

        const pingFrame = generateWebSocketFrame({
          opcode: 0x09,
          payload: Buffer.from('ping-data'),
          masked: true
        });

        mockSocket.emit('data', pingFrame);
        
        // Should not have sent automatic pong
        expect(writeSpy).not.toHaveBeenCalled();
      });

      it('should send pong frame manually', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.pong(Buffer.from('pong-data'));
        
        expect(writeSpy).toHaveBeenCalledOnce();
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData[0]).toBe(0x8A); // FIN + pong opcode
      });

      it('should emit pong event when pong frame is received', () => {
        let pongReceived = false;
        let pongData;
        
        connection.on('pong', (data) => {
          pongReceived = true;
          pongData = data;
        });

        const pongFrame = generateWebSocketFrame({
          opcode: 0x0A, // Pong
          payload: Buffer.from('pong-response'),
          masked: true
        });

        mockSocket.emit('data', pongFrame);
        
        expect(pongReceived).toBe(true);
        expect(pongData).toEqual(Buffer.from('pong-response'));
      });

      it('should handle control frames with maximum payload size', () => {
        const maxPayload = Buffer.alloc(125, 0x42); // Maximum allowed for control frames
        
        const pingFrame = generateWebSocketFrame({
          opcode: 0x09,
          payload: maxPayload,
          masked: true
        });

        let pingReceived = false;
        connection.on('ping', () => { pingReceived = true; });

        mockSocket.emit('data', pingFrame);
        
        expect(pingReceived).toBe(true);
      });

      it('should reject control frames exceeding 125 bytes', () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Create an oversized ping frame (this will be caught during frame parsing)
        const oversizedPing = Buffer.alloc(200);
        oversizedPing[0] = 0x89; // Ping opcode
        oversizedPing[1] = 126;  // Invalid: control frames can't use extended length

        mockSocket.emit('data', oversizedPing);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
      connection._addSocketEventListeners();
    });

    describe('Protocol Violations', () => {
      it('should handle malformed frame headers', () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Send incomplete frame header
        const malformedData = Buffer.from([0x81]); // Only first byte
        mockSocket.emit('data', malformedData);
        
        // Should handle gracefully without immediate error
        expect(errorEmitted).toBe(false);
      });

      it('should detect unexpected continuation frames', () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Send continuation frame without initial frame
        const contFrame = generateWebSocketFrame({
          opcode: 0x00, // Continuation
          payload: 'unexpected',
          masked: true
        });

        mockSocket.emit('data', contFrame);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should detect reserved opcode usage', () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Create frame with reserved opcode
        const reservedFrame = Buffer.alloc(10);
        reservedFrame[0] = 0x83; // Reserved opcode 0x3
        reservedFrame[1] = 0x05; // Length 5
        Buffer.from('hello').copy(reservedFrame, 2);

        mockSocket.emit('data', reservedFrame);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should handle frames with reserved bits set', () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Create frame with RSV bits set (when no extensions are negotiated)
        const rsvFrame = Buffer.alloc(10);
        rsvFrame[0] = 0xF1; // FIN + RSV1,2,3 + text opcode
        rsvFrame[1] = 0x85; // Masked + length 5
        // Add mask key and payload...

        mockSocket.emit('data', rsvFrame);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });
    });

    describe('Buffer Overflow and Size Limits', () => {
      it('should enforce maxReceivedFrameSize', () => {
        const smallConfig = { ...config, maxReceivedFrameSize: 1000 };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, smallConfig);
        connection._addSocketEventListeners();

        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Create frame claiming to be larger than limit
        const oversizedFrame = Buffer.alloc(20);
        oversizedFrame[0] = 0x82; // Binary frame
        oversizedFrame[1] = 126;  // 16-bit length
        oversizedFrame.writeUInt16BE(2000, 2); // Exceeds limit

        mockSocket.emit('data', oversizedFrame);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should enforce maxReceivedMessageSize for assembled messages', () => {
        const smallConfig = { ...config, maxReceivedMessageSize: 20 };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, smallConfig);
        connection._addSocketEventListeners();

        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        // Send fragments that together exceed the message size limit
        const frame1 = generateWebSocketFrame({
          opcode: 0x01,
          fin: false,
          payload: 'First part of message',
          masked: true
        });

        const frame2 = generateWebSocketFrame({
          opcode: 0x00,
          fin: true,
          payload: ' second part that makes it too long',
          masked: true
        });

        mockSocket.emit('data', frame1);
        mockSocket.emit('data', frame2);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should handle maximum valid frame size', () => {
        const maxValidSize = 1000;
        const maxConfig = { ...config, maxReceivedFrameSize: maxValidSize };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, maxConfig);
        connection._addSocketEventListeners();

        let messageReceived = false;
        connection.on('message', () => { messageReceived = true; });

        const maxFrame = generateWebSocketFrame({
          opcode: 0x02,
          payload: Buffer.alloc(maxValidSize, 0x42),
          masked: true
        });

        mockSocket.emit('data', maxFrame);
        
        expect(messageReceived).toBe(true);
        expectConnectionState(connection, 'open');
      });
    });

    describe('Network Error Scenarios', () => {
      it('should handle socket error events', async () => {
        let errorEmitted = false;
        connection.on('error', () => { errorEmitted = true; });

        const socketError = new Error('Network error');
        mockSocket.emit('error', socketError);
        
        expect(errorEmitted).toBe(true);
        expectConnectionState(connection, 'closed');
      });

      it('should handle unexpected socket end', async () => {
        const closePromise = new Promise((resolve) => {
          connection.once('close', resolve);
        });

        mockSocket.emit('end');
        
        await closePromise;
        expectConnectionState(connection, 'closed');
      });

      it('should handle socket close event', async () => {
        const closePromise = new Promise((resolve) => {
          connection.once('close', resolve);
        });

        mockSocket.emit('close');
        
        await closePromise;
        expectConnectionState(connection, 'closed');
        expect(connection.connected).toBe(false);
      });

      it('should clean up resources on error', () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        
        connection.drop();
        
        // Should clean up any timers
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expectConnectionState(connection, 'closed');
      });
    });

    describe('Resource Cleanup', () => {
      it('should clean up frame queue on close', () => {
        // Add some frames to the queue
        const frame1 = generateWebSocketFrame({ opcode: 0x01, fin: false, payload: 'part1', masked: true });
        const frame2 = generateWebSocketFrame({ opcode: 0x00, fin: false, payload: 'part2', masked: true });
        
        mockSocket.emit('data', frame1);
        mockSocket.emit('data', frame2);
        
        expect(connection.frameQueue.length).toBeGreaterThan(0);
        
        connection.drop();
        
        expect(connection.frameQueue.length).toBe(0);
      });

      it('should clean up buffer list on close', () => {
        connection.drop();
        
        expect(connection.bufferList.length).toBe(0);
      });

      it('should remove socket listeners on close', () => {
        const removeAllListenersSpy = vi.spyOn(mockSocket, 'removeAllListeners');
        
        connection.drop();
        
        expect(removeAllListenersSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Configuration Testing', () => {
    describe('Fragment Assembly Configuration', () => {
      it('should respect assembleFragments: false setting', () => {
        const noAssembleConfig = { ...config, assembleFragments: false };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, noAssembleConfig);
        connection._addSocketEventListeners();

        const frames = [];
        connection.on('frame', (frame) => frames.push(frame));

        const textFrame = generateWebSocketFrame({
          opcode: 0x01,
          payload: 'test message',
          masked: true
        });

        mockSocket.emit('data', textFrame);
        
        expect(frames).toHaveLength(1);
        expect(frames[0].opcode).toBe(0x01);
        expect(frames[0].binaryPayload.toString('utf8')).toBe('test message');
      });

      it('should respect fragmentOutgoingMessages: false setting', () => {
        const noFragmentConfig = { ...config, fragmentOutgoingMessages: false };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, noFragmentConfig);
        
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        const longMessage = 'This is a very long message that would normally be fragmented';
        
        connection.sendUTF(longMessage);
        
        // Should send as single frame
        expect(writeSpy).toHaveBeenCalledOnce();
      });

      it('should respect custom fragmentationThreshold', () => {
        const customThresholdConfig = { ...config, fragmentationThreshold: 5 };
        connection = new WebSocketConnection(mockSocket, [], 'test', true, customThresholdConfig);
        
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.sendUTF('short'); // Exactly at threshold
        expect(writeSpy.mock.calls.length).toBe(1); // Single frame
        
        writeSpy.mockClear();
        
        connection.sendUTF('longer message'); // Over threshold
        expect(writeSpy.mock.calls.length).toBeGreaterThan(1); // Multiple frames
      });
    });

    describe('Masking Configuration', () => {
      it('should mask outgoing packets when maskOutgoingPackets is true', () => {
        connection = new WebSocketConnection(mockSocket, [], 'test', true, config);
        
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.sendUTF('test');
        
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData[1] & 0x80).toBe(0x80); // Mask bit set
      });

      it('should not mask outgoing packets when maskOutgoingPackets is false', () => {
        connection = new WebSocketConnection(mockSocket, [], 'test', false, config);
        
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
        
        connection.sendUTF('test');
        
        const writtenData = writeSpy.mock.calls[0][0];
        expect(writtenData[1] & 0x80).toBe(0x00); // Mask bit not set
      });
    });

    describe('Socket Configuration', () => {
      it('should configure Nagle algorithm setting', () => {
        const setNoDelaySpy = vi.spyOn(mockSocket, 'setNoDelay');
        
        // Test enabled
        connection = new WebSocketConnection(mockSocket, [], 'test', true, { ...config, disableNagleAlgorithm: true });
        expect(setNoDelaySpy).toHaveBeenCalledWith(true);
        
        setNoDelaySpy.mockClear();
        
        // Test disabled
        const newSocket = new MockSocket();
        const setNoDelaySpyNew = vi.spyOn(newSocket, 'setNoDelay');
        connection = new WebSocketConnection(newSocket, [], 'test', true, { ...config, disableNagleAlgorithm: false });
        expect(setNoDelaySpyNew).toHaveBeenCalledWith(false);
      });

      it('should configure socket timeout', () => {
        const setTimeoutSpy = vi.spyOn(mockSocket, 'setTimeout');
        
        connection = new WebSocketConnection(mockSocket, [], 'test', true, config);
        
        expect(setTimeoutSpy).toHaveBeenCalledWith(0);
      });
    });

    describe('Validation of Configuration Parameters', () => {
      it('should validate keepalive configuration', () => {
        const invalidConfig = { ...config, keepalive: true, useNativeKeepalive: false };
        // Missing keepaliveInterval
        
        expect(() => {
          new WebSocketConnection(mockSocket, [], 'test', true, invalidConfig);
        }).toThrow('keepaliveInterval must be specified');
      });

      it('should validate keepalive grace period configuration', () => {
        const invalidConfig = { 
          ...config, 
          keepalive: true, 
          useNativeKeepalive: false,
          keepaliveInterval: 30000,
          dropConnectionOnKeepaliveTimeout: true
          // Missing keepaliveGracePeriod
        };
        
        expect(() => {
          new WebSocketConnection(mockSocket, [], 'test', true, invalidConfig);
        }).toThrow('keepaliveGracePeriod  must be specified');
      });

      it('should validate native keepalive support', () => {
        const socketWithoutKeepalive = { ...mockSocket };
        delete socketWithoutKeepalive.setKeepAlive;
        
        const nativeKeepaliveConfig = { 
          ...config, 
          keepalive: true, 
          useNativeKeepalive: true,
          keepaliveInterval: 30000
        };
        
        expect(() => {
          new WebSocketConnection(socketWithoutKeepalive, [], 'test', true, nativeKeepaliveConfig);
        }).toThrow('Unable to use native keepalive');
      });
    });
  });

  describe('Flow Control and Backpressure', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
      connection._addSocketEventListeners();
    });

    describe('Socket Backpressure Handling', () => {
      it('should handle socket write returning false (backpressure)', () => {
        const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(false);
        
        connection.sendUTF('test message');
        
        expect(writeSpy).toHaveBeenCalledOnce();
        expect(connection.outputBufferFull).toBe(true);
      });

      it('should emit drain event when socket drains', () => {
        let drainEmitted = false;
        connection.on('drain', () => { drainEmitted = true; });
        
        // Simulate socket drain
        mockSocket.emit('drain');
        
        expect(drainEmitted).toBe(true);
        expect(connection.outputBufferFull).toBe(false);
      });

      it('should handle socket pause event', () => {
        let pauseEmitted = false;
        connection.on('pause', () => { pauseEmitted = true; });
        
        mockSocket.emit('pause');
        
        expect(pauseEmitted).toBe(true);
        expect(connection.inputPaused).toBe(true);
      });

      it('should handle socket resume event', () => {
        let resumeEmitted = false;
        connection.on('resume', () => { resumeEmitted = true; });
        
        // First pause
        mockSocket.emit('pause');
        expect(connection.inputPaused).toBe(true);
        
        // Then resume
        mockSocket.emit('resume');
        
        expect(resumeEmitted).toBe(true);
        expect(connection.inputPaused).toBe(false);
      });
    });

    describe('Connection Pause/Resume', () => {
      it('should pause connection processing', () => {
        const pauseSpy = vi.spyOn(mockSocket, 'pause');
        
        connection.pause();
        
        expect(pauseSpy).toHaveBeenCalledOnce();
      });

      it('should resume connection processing', () => {
        const resumeSpy = vi.spyOn(mockSocket, 'resume');
        
        connection.resume();
        
        expect(resumeSpy).toHaveBeenCalledOnce();
      });
    });
  });
});