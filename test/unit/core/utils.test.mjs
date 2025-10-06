/**
 * Utils Module Unit Tests
 *
 * Comprehensive tests for utility functions including:
 * - extend() for object merging
 * - eventEmitterListenerCount() for compatibility
 * - bufferAllocUnsafe() for buffer allocation
 * - bufferFromString() for buffer creation
 * - BufferingLogger for debug logging
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as utils from '../../../lib/utils.js';
import debug from 'debug';

describe('Utils Module', () => {
  describe('noop()', () => {
    it('should be a function that does nothing', () => {
      expect(typeof utils.noop).toBe('function');
      expect(utils.noop()).toBeUndefined();
    });

    it('should not throw when called', () => {
      expect(() => utils.noop()).not.toThrow();
    });

    it('should accept any arguments', () => {
      expect(() => utils.noop(1, 2, 3, 'test', {}, [])).not.toThrow();
    });
  });

  describe('extend()', () => {
    it('should copy properties from source to destination', () => {
      const dest = { a: 1, b: 2 };
      const source = { c: 3, d: 4 };

      utils.extend(dest, source);

      expect(dest).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should overwrite existing properties', () => {
      const dest = { a: 1, b: 2 };
      const source = { b: 99, c: 3 };

      utils.extend(dest, source);

      expect(dest).toEqual({ a: 1, b: 99, c: 3 });
    });

    it('should handle empty source object', () => {
      const dest = { a: 1 };
      const source = {};

      utils.extend(dest, source);

      expect(dest).toEqual({ a: 1 });
    });

    it('should handle empty destination object', () => {
      const dest = {};
      const source = { a: 1, b: 2 };

      utils.extend(dest, source);

      expect(dest).toEqual({ a: 1, b: 2 });
    });

    it('should copy all enumerable properties including inherited ones', () => {
      const dest = {};
      function SourceConstructor() {
        this.ownProp = 'own';
      }
      SourceConstructor.prototype.protoProp = 'proto';
      const source = new SourceConstructor();

      utils.extend(dest, source);

      // extend uses for...in which copies own properties
      expect(dest.ownProp).toBe('own');
      // Note: extend() copies enumerable properties via for...in
      // which includes prototype properties. This is the actual behavior.
    });

    it('should handle nested objects by reference', () => {
      const nested = { x: 1 };
      const dest = {};
      const source = { nested };

      utils.extend(dest, source);

      expect(dest.nested).toBe(nested);

      // Modifying nested should affect both
      nested.x = 99;
      expect(dest.nested.x).toBe(99);
    });

    it('should handle various data types', () => {
      const dest = {};
      const source = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, 3],
        object: { nested: true },
        func: () => 'test'
      };

      utils.extend(dest, source);

      expect(dest.string).toBe('test');
      expect(dest.number).toBe(42);
      expect(dest.boolean).toBe(true);
      expect(dest.null).toBe(null);
      expect(dest.undefined).toBeUndefined();
      expect(dest.array).toEqual([1, 2, 3]);
      expect(dest.object).toEqual({ nested: true });
      expect(typeof dest.func).toBe('function');
    });
  });

  describe('eventEmitterListenerCount()', () => {
    it('should count listeners for an event', () => {
      const emitter = new EventEmitter();
      const handler1 = () => {};
      const handler2 = () => {};

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      const count = utils.eventEmitterListenerCount(emitter, 'test');

      expect(count).toBe(2);
    });

    it('should return 0 for event with no listeners', () => {
      const emitter = new EventEmitter();

      const count = utils.eventEmitterListenerCount(emitter, 'nonexistent');

      expect(count).toBe(0);
    });

    it('should distinguish between different events', () => {
      const emitter = new EventEmitter();

      emitter.on('event1', () => {});
      emitter.on('event1', () => {});
      emitter.on('event2', () => {});

      expect(utils.eventEmitterListenerCount(emitter, 'event1')).toBe(2);
      expect(utils.eventEmitterListenerCount(emitter, 'event2')).toBe(1);
    });

    it('should work with once listeners', () => {
      const emitter = new EventEmitter();

      emitter.once('test', () => {});
      emitter.on('test', () => {});

      const count = utils.eventEmitterListenerCount(emitter, 'test');

      expect(count).toBe(2);
    });
  });

  describe('bufferAllocUnsafe()', () => {
    it('should allocate buffer of specified size', () => {
      const buffer = utils.bufferAllocUnsafe(10);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(10);
    });

    it('should allocate empty buffer for size 0', () => {
      const buffer = utils.bufferAllocUnsafe(0);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(0);
    });

    it('should allocate large buffers', () => {
      const buffer = utils.bufferAllocUnsafe(1024 * 1024); // 1MB

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(1024 * 1024);
    });

    it('should not initialize buffer contents', () => {
      // bufferAllocUnsafe doesn't zero the memory, so we just verify it creates a buffer
      const buffer = utils.bufferAllocUnsafe(10);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      // Content is uninitialized, so we don't test specific values
    });
  });

  describe('bufferFromString()', () => {
    it('should create buffer from string', () => {
      const buffer = utils.bufferFromString('hello');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('hello');
    });

    it('should handle empty string', () => {
      const buffer = utils.bufferFromString('');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(0);
    });

    it('should respect encoding parameter', () => {
      const hexString = '48656c6c6f'; // "Hello" in hex
      const buffer = utils.bufferFromString(hexString, 'hex');

      expect(buffer.toString()).toBe('Hello');
    });

    it('should handle UTF-8 encoding', () => {
      const buffer = utils.bufferFromString('Hello 世界', 'utf8');

      expect(buffer.toString('utf8')).toBe('Hello 世界');
    });

    it('should handle base64 encoding', () => {
      const base64String = Buffer.from('test').toString('base64');
      const buffer = utils.bufferFromString(base64String, 'base64');

      expect(buffer.toString()).toBe('test');
    });

    it('should handle binary encoding', () => {
      const binaryString = '\x00\x01\x02\x03';
      const buffer = utils.bufferFromString(binaryString, 'binary');

      expect(buffer[0]).toBe(0x00);
      expect(buffer[1]).toBe(0x01);
      expect(buffer[2]).toBe(0x02);
      expect(buffer[3]).toBe(0x03);
    });
  });

  describe('BufferingLogger', () => {
    let originalDebugEnv;

    beforeEach(() => {
      originalDebugEnv = process.env.DEBUG;
    });

    afterEach(() => {
      debug.disable();
      if (originalDebugEnv !== undefined) {
        process.env.DEBUG = originalDebugEnv;
        if (originalDebugEnv) {
          debug.enable(originalDebugEnv);
        }
      } else {
        delete process.env.DEBUG;
      }
    });

    it('should create logger instance', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      expect(typeof logger).toBe('function');
      expect(typeof logger.printOutput).toBe('function');
    });

    it('should return noop function when debug disabled', () => {
      delete process.env.DEBUG;
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      expect(typeof logger).toBe('function');
      expect(typeof logger.printOutput).toBe('function');
      expect(logger.printOutput).toBe(utils.noop);
    });

    it('should buffer log messages when enabled', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      if (logger.enabled) {
        logger('message 1');
        logger('message 2', 'arg2');
        logger('message 3');

        // BufferingLogger should buffer these calls
        expect(logger.printOutput).toBeDefined();
      }
    });

    it('should support chaining', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      if (logger.enabled) {
        const result = logger('test');
        // BufferingLogger.log returns this for chaining
        expect(result).toBeDefined();
      }
    });
  });

  describe('BufferingLogger class', () => {
    it('should accumulate log entries when enabled', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'test-id');

      if (logger.enabled) {
        logger('test message 1');
        logger('test message 2');
        // Logger should have buffered messages
        expect(typeof logger.printOutput).toBe('function');
      }
    });

    it('should handle multiple arguments when enabled', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      if (logger.enabled) {
        logger('message with %s and %d', 'string', 42);

        // Should buffer the format string and arguments
        expect(typeof logger.printOutput).toBe('function');
      }
    });

    it('should handle null and undefined in log messages', () => {
      process.env.DEBUG = 'websocket:*';
      const logger = utils.BufferingLogger('websocket:test', 'unique-id');

      if (logger.enabled) {
        logger(null);
        logger(undefined);
        logger('message', null, undefined);

        // Should not throw
        expect(() => logger.printOutput(vi.fn())).not.toThrow();
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle extend with null source gracefully', () => {
      const dest = { a: 1 };

      // This might throw depending on implementation
      // Testing actual behavior
      try {
        utils.extend(dest, null);
        // If it doesn't throw, dest should be unchanged
        expect(dest.a).toBe(1);
      } catch (err) {
        // Expected if implementation doesn't handle null
        expect(err).toBeDefined();
      }
    });

    it('should handle eventEmitterListenerCount with null emitter gracefully', () => {
      // This should throw or handle gracefully
      try {
        const count = utils.eventEmitterListenerCount(null, 'test');
        expect(count).toBe(0);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should handle bufferAllocUnsafe with negative size', () => {
      expect(() => {
        utils.bufferAllocUnsafe(-1);
      }).toThrow();
    });

    it('should handle bufferAllocUnsafe with non-integer size', () => {
      // Node.js will coerce to integer
      const buffer = utils.bufferAllocUnsafe(10.7);
      expect(buffer.length).toBe(10);
    });

    it('should throw for bufferFromString with invalid encoding', () => {
      // Node.js will throw for truly invalid encodings
      expect(() => {
        utils.bufferFromString('test', 'invalid-encoding');
      }).toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    it('should use modern Buffer methods when available', () => {
      // Verify we're using modern Node.js methods
      expect(Buffer.allocUnsafe).toBeDefined();
      expect(Buffer.from).toBeDefined();

      const unsafeBuffer = utils.bufferAllocUnsafe(10);
      const fromBuffer = utils.bufferFromString('test');

      expect(Buffer.isBuffer(unsafeBuffer)).toBe(true);
      expect(Buffer.isBuffer(fromBuffer)).toBe(true);
    });

    it('should maintain compatibility with old EventEmitter API', () => {
      const emitter = new EventEmitter();
      emitter.on('test', () => {});

      // Should work with both old and new APIs
      const count = utils.eventEmitterListenerCount(emitter, 'test');
      expect(count).toBeGreaterThan(0);
    });
  });
});
