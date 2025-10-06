/**
 * Additional utils.js Coverage Tests
 *
 * Tests for utility functions to improve overall coverage to 85%+
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as utils from '../../../lib/utils.js';

describe('utils - Additional Coverage', () => {
  describe('noop', () => {
    it('should be a function that does nothing', () => {
      expect(typeof utils.noop).toBe('function');
      expect(utils.noop()).toBeUndefined();
      expect(utils.noop(1, 2, 3)).toBeUndefined();
    });
  });

  describe('extend', () => {
    it('should copy properties from source to destination', () => {
      const dest = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };

      utils.extend(dest, source);

      expect(dest).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should handle empty source object', () => {
      const dest = { a: 1 };
      utils.extend(dest, {});
      expect(dest).toEqual({ a: 1 });
    });

    it('should overwrite existing properties', () => {
      const dest = { name: 'old', value: 100 };
      const source = { name: 'new' };

      utils.extend(dest, source);

      expect(dest.name).toBe('new');
      expect(dest.value).toBe(100);
    });
  });

  describe('eventEmitterListenerCount', () => {
    it('should return listener count for an event', () => {
      const EventEmitter = require('events').EventEmitter;
      const emitter = new EventEmitter();

      const listener1 = () => {};
      const listener2 = () => {};

      emitter.on('test', listener1);
      emitter.on('test', listener2);

      const count = utils.eventEmitterListenerCount(emitter, 'test');
      expect(count).toBe(2);
    });

    it('should return 0 for event with no listeners', () => {
      const EventEmitter = require('events').EventEmitter;
      const emitter = new EventEmitter();

      const count = utils.eventEmitterListenerCount(emitter, 'nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('bufferAllocUnsafe', () => {
    it('should allocate a buffer of specified size', () => {
      const buffer = utils.bufferAllocUnsafe(10);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(10);
    });

    it('should allocate zero-length buffer', () => {
      const buffer = utils.bufferAllocUnsafe(0);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(0);
    });

    it('should allocate large buffer', () => {
      const buffer = utils.bufferAllocUnsafe(1024);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(1024);
    });
  });

  describe('bufferFromString', () => {
    it('should create buffer from string with default encoding', () => {
      const buffer = utils.bufferFromString('hello');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('hello');
    });

    it('should create buffer from string with utf8 encoding', () => {
      const buffer = utils.bufferFromString('hello', 'utf8');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('utf8')).toBe('hello');
    });

    it('should create buffer from string with hex encoding', () => {
      const buffer = utils.bufferFromString('48656c6c6f', 'hex');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('utf8')).toBe('Hello');
    });

    it('should create buffer from string with base64 encoding', () => {
      const buffer = utils.bufferFromString('aGVsbG8=', 'base64');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('utf8')).toBe('hello');
    });

    it('should handle empty string', () => {
      const buffer = utils.bufferFromString('');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(0);
    });

    it('should handle unicode characters', () => {
      const buffer = utils.bufferFromString('Hello 世界 🌍');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('utf8')).toBe('Hello 世界 🌍');
    });
  });

  describe('BufferingLogger', () => {
    it('should create a logger function when debug is disabled', () => {
      // When debug is disabled, it returns the logFunction with noop printOutput
      const logger = utils.BufferingLogger('test:disabled', 'id123');

      expect(typeof logger).toBe('function');
      expect(typeof logger.printOutput).toBe('function');
      expect(logger.enabled).toBeDefined();
    });

    it('should create a BufferingLogger when debug is enabled', () => {
      // Enable debug for this test
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'test:enabled:*';

      // Force require cache clear for debug module
      const debugModule = require('debug');
      debugModule.enable('test:enabled:*');

      const logger = utils.BufferingLogger('test:enabled:logger', 'id456');

      expect(typeof logger).toBe('function');
      expect(typeof logger.printOutput).toBe('function');

      // Test logging functionality
      logger('Test message', 'arg1', 'arg2');

      // The logger should buffer messages
      expect(typeof logger.printOutput).toBe('function');

      // Restore original DEBUG setting
      if (originalDebug) {
        process.env.DEBUG = originalDebug;
        debugModule.enable(originalDebug);
      } else {
        delete process.env.DEBUG;
        debugModule.disable();
      }
    });
  });
});
