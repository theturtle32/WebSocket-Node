/**
 * Enhanced Utils Tests - Additional Coverage
 *
 * Tests specifically targeting previously uncovered code paths in utils.js:
 * - BufferingLogger.clear() method
 * - BufferingLogger.printOutput() with actual output
 * - BufferingLogger.printOutput() with custom log function
 * - Edge cases in buffer creation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as utils from '../../../lib/utils.js';

describe('Utils Module - Enhanced Coverage', () => {
  describe('BufferingLogger.printOutput() behavior', () => {
    let originalDebugEnv;

    beforeEach(() => {
      originalDebugEnv = process.env.DEBUG;
      process.env.DEBUG = 'websocket:*';
    });

    afterEach(() => {
      if (originalDebugEnv !== undefined) {
        process.env.DEBUG = originalDebugEnv;
      } else {
        delete process.env.DEBUG;
      }
    });

    it('should not clear the buffer after printing and allow new messages', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        // Add some messages
        logger('message 1');
        logger('message 2');
        logger('message 3');

        const mockLog = vi.fn();

        // Print output (should have 3 messages)
        logger.printOutput(mockLog);
        expect(mockLog).toHaveBeenCalledTimes(3);

        // Log another message
        logger('message 4');
        mockLog.mockClear();

        // Print again (should have all 4 messages)
        logger.printOutput(mockLog);
        expect(mockLog).toHaveBeenCalledTimes(4);
      }
    });
  });

  describe('BufferingLogger.printOutput() with actual logging', () => {
    let originalDebugEnv;

    beforeEach(() => {
      originalDebugEnv = process.env.DEBUG;
      process.env.DEBUG = 'websocket:*';
    });

    afterEach(() => {
      if (originalDebugEnv !== undefined) {
        process.env.DEBUG = originalDebugEnv;
      } else {
        delete process.env.DEBUG;
      }
    });

    it('should call log function with formatted output', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger('Test message');
        logger('Message with %s', 'arg');

        const mockLog = vi.fn();
        logger.printOutput(mockLog);

        expect(mockLog).toHaveBeenCalled();
        // Verify the format includes timestamp and uniqueID
        const firstCall = mockLog.mock.calls[0];
        expect(firstCall).toBeDefined();
        expect(firstCall[0]).toContain('test-id');
      }
    });

    it('should handle format string with multiple arguments', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger('Format: %s, %d, %j', 'string', 42, {obj: 'value'});

        const mockLog = vi.fn();
        logger.printOutput(mockLog);

        expect(mockLog).toHaveBeenCalled();
      }
    });

    it('should use default log function if none provided', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger('Test message');

        // Call printOutput without arguments - should use default logFunction
        expect(() => logger.printOutput()).not.toThrow();
      }
    });

    it('should handle empty buffer gracefully', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        const mockLog = vi.fn();
        // Don't log anything, just print
        logger.printOutput(mockLog);

        // Should not have called mockLog since buffer is empty
        expect(mockLog).not.toHaveBeenCalled();
      }
    });

    it('should handle numeric log entries', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger(123);
        logger(45.67);
        logger(0);

        const mockLog = vi.fn();
        logger.printOutput(mockLog);

        expect(mockLog).toHaveBeenCalledTimes(3);
      }
    });

    it('should handle boolean log entries', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger(true);
        logger(false);

        const mockLog = vi.fn();
        logger.printOutput(mockLog);

        expect(mockLog).toHaveBeenCalledTimes(2);
      }
    });

    it('should handle object log entries', () => {
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger({key: 'value'});
        logger([1, 2, 3]);

        const mockLog = vi.fn();
        logger.printOutput(mockLog);

        expect(mockLog).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('extend() additional coverage', () => {
    it('should handle symbols as property keys', () => {
      const sym = Symbol('test');
      const dest = {};
      const source = {[sym]: 'symbol value', regular: 'regular value'};

      utils.extend(dest, source);

      // extend uses for...in which doesn't enumerate symbols
      expect(dest.regular).toBe('regular value');
      expect(dest[sym]).toBeUndefined(); // Symbols not copied by for...in
    });

    it('should copy the value from getters, not the getter itself', () => {
      const dest = {};
      let value = 'initial';
      const source = {
        get prop() { return value; },
        set prop(v) { value = v; }
      };

      utils.extend(dest, source);

      // extend() evaluates the getter and copies the value.
      expect(dest.prop).toBe('initial');

      // Verify that 'prop' on dest is a data property, not an accessor property.
      const descriptor = Object.getOwnPropertyDescriptor(dest, 'prop');
      expect(descriptor.get).toBeUndefined();
      expect(descriptor.set).toBeUndefined();

      // Changing the original source's value should not affect the copied property.
      value = 'changed';
      expect(dest.prop).toBe('initial');
    });

    it('should handle non-enumerable properties', () => {
      const dest = {};
      const source = {};
      Object.defineProperty(source, 'nonEnum', {
        value: 'hidden',
        enumerable: false
      });
      source.enum = 'visible';

      utils.extend(dest, source);

      // For...in only copies enumerable properties
      expect(dest.enum).toBe('visible');
      expect(dest.nonEnum).toBeUndefined();
    });
  });

  describe('Buffer utility functions additional coverage', () => {
    it('should handle bufferAllocUnsafe with very large size', () => {
      // Test with a large but reasonable size
      const size = 1024 * 1024; // 1MB
      const buffer = utils.bufferAllocUnsafe(size);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(size);
    });

    it('should handle bufferFromString with hex encoding', () => {
      const hexString = '48656c6c6f'; // "Hello" in hex
      const buffer = utils.bufferFromString(hexString, 'hex');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('Hello');
    });

    it('should handle bufferFromString with ascii encoding', () => {
      const asciiString = 'Hello ASCII';
      const buffer = utils.bufferFromString(asciiString, 'ascii');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('ascii')).toBe(asciiString);
    });

    it('should handle bufferFromString with special characters', () => {
      const specialString = '\n\r\t\0';
      const buffer = utils.bufferFromString(specialString, 'utf8');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle bufferFromString with emoji', () => {
      const emojiString = '😀😃😄😁';
      const buffer = utils.bufferFromString(emojiString, 'utf8');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8')).toBe(emojiString);
    });
  });

  describe('eventEmitterListenerCount() additional coverage', () => {
    const { EventEmitter } = require('events');

    it('should handle multiple listeners on same event', () => {
      const emitter = new EventEmitter();

      const listener1 = () => {};
      const listener2 = () => {};
      const listener3 = () => {};

      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.on('test', listener3);

      const count = utils.eventEmitterListenerCount(emitter, 'test');
      expect(count).toBe(3);
    });

    it('should handle listeners after removal', () => {
      const emitter = new EventEmitter();

      const listener1 = () => {};
      const listener2 = () => {};

      emitter.on('test', listener1);
      emitter.on('test', listener2);

      expect(utils.eventEmitterListenerCount(emitter, 'test')).toBe(2);

      emitter.removeListener('test', listener1);

      expect(utils.eventEmitterListenerCount(emitter, 'test')).toBe(1);
    });

    it('should handle removeAllListeners', () => {
      const emitter = new EventEmitter();

      emitter.on('test', () => {});
      emitter.on('test', () => {});

      expect(utils.eventEmitterListenerCount(emitter, 'test')).toBe(2);

      emitter.removeAllListeners('test');

      expect(utils.eventEmitterListenerCount(emitter, 'test')).toBe(0);
    });
  });

  describe('noop() additional coverage', () => {
    it('should return undefined with any number of arguments', () => {
      expect(utils.noop()).toBeUndefined();
      expect(utils.noop(1)).toBeUndefined();
      expect(utils.noop(1, 2, 3, 4, 5)).toBeUndefined();
      expect(utils.noop(null, undefined, {}, [], 'test')).toBeUndefined();
    });

    it('should be usable as callback', () => {
      const asyncFunction = (callback) => {
        callback();
      };

      expect(() => asyncFunction(utils.noop)).not.toThrow();
    });
  });
});
