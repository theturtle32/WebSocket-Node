import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import WebSocketConnection from '../../../lib/WebSocketConnection.js';
import { MockSocket } from '../../helpers/mocks.mjs';
import { expectConnectionState } from '../../helpers/assertions.mjs';

describe('WebSocketConnection - Basic Testing', () => {
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

  describe('Connection Initialization', () => {
    it('should initialize connection with proper state and configuration', () => {
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
      expect(connection.config).toBe(config);
    });

    it('should set up socket configuration correctly', () => {
      const setNoDelaySpy = vi.spyOn(mockSocket, 'setNoDelay');
      const setTimeoutSpy = vi.spyOn(mockSocket, 'setTimeout');
      
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
      
      expect(setNoDelaySpy).toHaveBeenCalledWith(true);
      expect(setTimeoutSpy).toHaveBeenCalledWith(0);
    });

    it('should handle different masking configurations', () => {
      // Test client-side masking (true)
      const clientConnection = new WebSocketConnection(mockSocket, [], 'test', true, config);
      expect(clientConnection.maskOutgoingPackets).toBe(true);
      
      // Test server-side no masking (false)
      const serverConnection = new WebSocketConnection(new MockSocket(), [], 'test', false, config);
      expect(serverConnection.maskOutgoingPackets).toBe(false);
    });

    it('should track remote address from socket', () => {
      mockSocket.remoteAddress = '192.168.1.100';
      connection = new WebSocketConnection(mockSocket, [], null, true, config);
      
      expect(connection.remoteAddress).toBe('192.168.1.100');
    });

    it('should handle extensions and protocol negotiation', () => {
      const extensions = ['permessage-deflate'];
      connection = new WebSocketConnection(mockSocket, extensions, 'custom-protocol', false, config);
      
      expect(connection.extensions).toBe(extensions);
      expect(connection.protocol).toBe('custom-protocol');
      expect(connection.maskOutgoingPackets).toBe(false);
    });

    it('should remove existing socket error listeners', () => {
      const removeAllListenersSpy = vi.spyOn(mockSocket, 'removeAllListeners');
      connection = new WebSocketConnection(mockSocket, [], null, true, config);
      
      expect(removeAllListenersSpy).toHaveBeenCalledWith('error');
    });
  });

  describe('Connection State Management', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
    });

    it('should start in open state', () => {
      expectConnectionState(connection, 'open');
      expect(connection.connected).toBe(true);
      expect(connection.waitingForCloseResponse).toBe(false);
    });

    it('should handle graceful close initiation', () => {
      connection.close(1000, 'Normal closure');
      
      expectConnectionState(connection, 'ending');
      expect(connection.waitingForCloseResponse).toBe(true);
    });

    it('should handle drop with immediate closure', () => {
      connection.drop(1002, 'Protocol error', true);
      
      expectConnectionState(connection, 'closed');
      expect(connection.closeReasonCode).toBe(1002);
      expect(connection.closeDescription).toBe('Protocol error');
    });

    it('should validate close reason codes', () => {
      // Valid codes should work
      const validCodes = [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 3000, 4000];
      validCodes.forEach(code => {
        const testConnection = new WebSocketConnection(new MockSocket(), [], 'test', true, config);
        expect(() => testConnection.close(code, 'Test closure')).not.toThrow();
        expect(testConnection.state).toBe('ending');
      });

      // Invalid codes should throw
      const invalidCodes = [500, 999, 1004, 1005, 1006, 2000, 5000];
      invalidCodes.forEach(code => {
        expect(() => connection.close(code, 'Invalid code')).toThrow(/Close code .* is not valid/);
      });
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

    it('should prevent state changes after closed', () => {
      connection.state = 'closed';
      connection.connected = false;
      
      expect(() => connection.close()).not.toThrow();
      expect(connection.state).toBe('closed');
    });
  });

  describe('Message Sending', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
    });

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

    it('should send binary message via sendBytes', () => {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      
      connection.sendBytes(binaryData);
      
      expect(writeSpy).toHaveBeenCalledOnce();
      const writtenData = writeSpy.mock.calls[0][0];
      expect(writtenData[0]).toBe(0x82); // FIN + binary opcode
      expect(writtenData[1] & 0x80).toBe(0x80); // Mask bit set
    });

    it('should send ping frame', () => {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
      
      connection.ping(Buffer.from('ping-data'));
      
      expect(writeSpy).toHaveBeenCalledOnce();
      const writtenData = writeSpy.mock.calls[0][0];
      expect(writtenData[0]).toBe(0x89); // FIN + ping opcode
    });

    it('should send pong frame', () => {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
      
      connection.pong(Buffer.from('pong-data'));
      
      expect(writeSpy).toHaveBeenCalledOnce();
      const writtenData = writeSpy.mock.calls[0][0];
      expect(writtenData[0]).toBe(0x8A); // FIN + pong opcode
    });

    it('should handle generic send method', () => {
      const sendUTFSpy = vi.spyOn(connection, 'sendUTF');
      const sendBytesSpy = vi.spyOn(connection, 'sendBytes');
      
      // String should delegate to sendUTF
      connection.send('Hello World');
      expect(sendUTFSpy).toHaveBeenCalledWith('Hello World', undefined);
      
      // Buffer should delegate to sendBytes
      const buffer = Buffer.from('test');
      connection.send(buffer);
      expect(sendBytesSpy).toHaveBeenCalledWith(buffer, undefined);
      
      // Invalid types should throw
      expect(() => connection.send(123)).toThrow();
      expect(() => connection.send({})).toThrow();
      expect(() => connection.send(null)).toThrow();
    });

    it('should handle send callbacks', (done) => {
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

    it('should handle masking configuration correctly', () => {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(true);
      
      // Client connection (should mask)
      connection.sendUTF('test');
      let writtenData = writeSpy.mock.calls[0][0];
      expect(writtenData[1] & 0x80).toBe(0x80); // Mask bit set
      
      writeSpy.mockClear();
      
      // Server connection (should not mask)
      const serverConnection = new WebSocketConnection(new MockSocket(), [], 'test', false, config);
      const serverWriteSpy = vi.spyOn(serverConnection.socket, 'write').mockReturnValue(true);
      
      serverConnection.sendUTF('test');
      writtenData = serverWriteSpy.mock.calls[0][0];
      expect(writtenData[1] & 0x80).toBe(0x00); // Mask bit not set
    });
  });

  describe('Configuration Validation', () => {
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

    it('should configure native keepalive when supported', () => {
      const setKeepAliveSpy = vi.spyOn(mockSocket, 'setKeepAlive');
      
      const nativeKeepaliveConfig = { 
        ...config, 
        keepalive: true, 
        useNativeKeepalive: true,
        keepaliveInterval: 30000
      };
      
      connection = new WebSocketConnection(mockSocket, [], 'test', true, nativeKeepaliveConfig);
      
      expect(setKeepAliveSpy).toHaveBeenCalledWith(true, 30000);
    });
  });

  describe('Event Handling Setup', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
    });

    it('should set up socket event listeners when called', () => {
      const eventSpy = vi.spyOn(mockSocket, 'on');
      connection._addSocketEventListeners();

      expect(eventSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('end', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('close', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('drain', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('pause', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('resume', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should track ping listener count correctly', () => {
      expect(connection._pingListenerCount).toBe(0);
      
      const pingHandler = () => {};
      connection.on('ping', pingHandler);
      expect(connection._pingListenerCount).toBe(1);
      
      connection.removeListener('ping', pingHandler);
      expect(connection._pingListenerCount).toBe(0);
    });
  });

  describe('Flow Control', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
    });

    it('should handle socket backpressure', () => {
      const writeSpy = vi.spyOn(mockSocket, 'write').mockReturnValue(false);
      
      connection.sendUTF('test message');
      
      expect(writeSpy).toHaveBeenCalledOnce();
      expect(connection.outputBufferFull).toBe(true);
    });

    it('should handle pause and resume', () => {
      const pauseSpy = vi.spyOn(mockSocket, 'pause');
      const resumeSpy = vi.spyOn(mockSocket, 'resume');
      
      connection.pause();
      expect(pauseSpy).toHaveBeenCalledOnce();
      
      connection.resume();
      expect(resumeSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      connection = new WebSocketConnection(mockSocket, [], 'test-protocol', true, config);
    });

    it('should initialize frame processing resources', () => {
      expect(connection.maskBytes).toBeInstanceOf(Buffer);
      expect(connection.maskBytes.length).toBe(4);
      expect(connection.frameHeader).toBeInstanceOf(Buffer);
      expect(connection.frameHeader.length).toBe(10);
      expect(connection.bufferList).toBeDefined();
      expect(connection.currentFrame).toBeDefined();
      expect(connection.frameQueue).toBeInstanceOf(Array);
    });

    it('should track connection state properties', () => {
      expect(connection.fragmentationSize).toBe(0);
      expect(connection.outputBufferFull).toBe(false);
      expect(connection.inputPaused).toBe(false);
      expect(connection.receivedEnd).toBe(false);
    });

    it('should clean up resources on drop', () => {
      // Add some state to clean up
      connection.frameQueue.push({});
      expect(connection.frameQueue.length).toBe(1);
      
      connection.drop();
      
      expect(connection.frameQueue.length).toBe(0);
      expectConnectionState(connection, 'closed');
    });
  });
});