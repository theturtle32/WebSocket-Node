import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  captureEvents,
  waitForEvent,
  waitForEventWithPayload,
  waitForEventCondition,
  waitForMultipleEvents,
  waitForEventSequence
} from '../../helpers/test-utils.mjs';
import {
  expectEventSequenceAsync,
  expectEventWithPayload,
  expectEventTiming,
  expectNoEvent
} from '../../helpers/assertions.mjs';

describe('Enhanced Event Testing Infrastructure', () => {
  let emitter;
  
  beforeEach(() => {
    emitter = new EventEmitter();
  });
  
  afterEach(() => {
    emitter.removeAllListeners();
  });

  describe('Enhanced captureEvents utility', () => {
    it('should capture events with timestamps and sequence tracking', () => {
      const capture = captureEvents(emitter, ['test', 'data'], {
        includeTimestamps: true,
        trackSequence: true
      });
      
      emitter.emit('test', 'arg1', 'arg2');
      emitter.emit('data', { value: 42 });
      emitter.emit('test', 'arg3');
      
      const testEvents = capture.getEvents('test');
      expect(testEvents).toHaveLength(2);
      expect(testEvents[0].args).toEqual(['arg1', 'arg2']);
      expect(testEvents[0].timestamp).toBeDefined();
      expect(testEvents[0].hrTimestamp).toBeDefined();
      
      const sequence = capture.getSequence();
      expect(sequence).toHaveLength(3);
      expect(sequence[0].eventName).toBe('test');
      expect(sequence[1].eventName).toBe('data');
      expect(sequence[2].eventName).toBe('test');
      
      capture.cleanup();
    });
    
    it('should validate event sequences', () => {
      const capture = captureEvents(emitter, ['open', 'ready', 'close']);
      
      emitter.emit('open');
      emitter.emit('ready', { status: 'ok' });
      emitter.emit('close', 1000, 'Normal');
      
      const validation = capture.validateSequence([
        { eventName: 'open' },
        { 
          eventName: 'ready',
          validator: (args) => args[0] && args[0].status === 'ok'
        },
        { eventName: 'close' }
      ]);
      
      expect(validation.valid).toBe(true);
      
      capture.cleanup();
    });
    
    it('should filter events based on criteria', () => {
      const capture = captureEvents(emitter, ['message'], {
        filter: (eventName, args) => args[0] && args[0].priority === 'high'
      });
      
      emitter.emit('message', { priority: 'low', text: 'ignore me' });
      emitter.emit('message', { priority: 'high', text: 'important' });
      emitter.emit('message', { priority: 'high', text: 'also important' });
      
      const messages = capture.getEvents('message');
      expect(messages).toHaveLength(2);
      expect(messages[0].args[0].text).toBe('important');
      expect(messages[1].args[0].text).toBe('also important');
      
      capture.cleanup();
    });
  });

  describe('Enhanced waitForEvent utilities', () => {
    it('should wait for event with condition', async () => {
      const promise = waitForEventCondition(
        emitter, 
        'data',
        (value) => value > 10,
        1000
      );
      
      // These should be ignored
      emitter.emit('data', 5);
      emitter.emit('data', 8);
      
      // This should satisfy the condition
      setTimeout(() => emitter.emit('data', 15), 10);
      
      const [result] = await promise;
      expect(result).toBe(15);
    });
    
    it('should wait for multiple events', async () => {
      const promise = waitForMultipleEvents(emitter, [
        'ready',
        { eventName: 'data', options: { validator: (data) => data.type === 'init' } }
      ]);
      
      setTimeout(() => {
        emitter.emit('ready');
        emitter.emit('data', { type: 'init', value: 42 });
      }, 10);
      
      const [readyArgs, dataArgs] = await promise;
      expect(readyArgs).toEqual([]);
      expect(dataArgs[0].type).toBe('init');
    });
    
    it('should wait for event sequence', async () => {
      const promise = waitForEventSequence(emitter, [
        { eventName: 'start' },
        { eventName: 'progress' },
        { eventName: 'complete' }
      ], { sequenceTimeout: 500 });
      
      setTimeout(() => {
        emitter.emit('start');
        emitter.emit('progress', 75);
        emitter.emit('complete');
      }, 10);
      
      const results = await promise;
      expect(results).toHaveLength(3);
      expect(results[1].args[0]).toBe(75);
    });
  });

  describe('Enhanced event assertions', () => {
    it('should validate event sequence asynchronously', async () => {
      const promise = expectEventSequenceAsync(emitter, [
        { eventName: 'connect' },
        { 
          eventName: 'authenticate',
          validator: (token) => token.startsWith('Bearer ')
        },
        { eventName: 'ready' }
      ]);
      
      setTimeout(() => {
        emitter.emit('connect');
        emitter.emit('authenticate', 'Bearer abc123');
        emitter.emit('ready');
      }, 10);
      
      const events = await promise;
      expect(events).toHaveLength(3);
      expect(events[1].args[0]).toBe('Bearer abc123');
    });
    
    it('should validate event with specific payload', async () => {
      const promise = expectEventWithPayload(emitter, 'user', 
        [{ id: 123, name: 'Alice' }],
        { timeout: 1000 }
      );
      
      setTimeout(() => {
        emitter.emit('user', { id: 123, name: 'Alice' });
      }, 10);
      
      const args = await promise;
      expect(args[0].name).toBe('Alice');
    });
    
    it('should validate event timing constraints', async () => {
      const promise = expectEventTiming(emitter, 'delayed', 50, 150);
      
      setTimeout(() => {
        emitter.emit('delayed', 'payload');
      }, 100); // Should be within 50-150ms range
      
      const result = await promise;
      expect(result.eventTime).toBeGreaterThanOrEqual(50);
      expect(result.eventTime).toBeLessThanOrEqual(150);
      expect(result.args[0]).toBe('payload');
    });
    
    it('should validate that no event occurs', async () => {
      const promise = expectNoEvent(emitter, 'forbidden', 100);
      
      // Emit other events, but not 'forbidden'
      setTimeout(() => {
        emitter.emit('allowed', 'ok');
        emitter.emit('other', 'also ok');
      }, 10);
      
      await promise; // Should resolve successfully
    });
    
    it('should fail when forbidden event is emitted', async () => {
      const promise = expectNoEvent(emitter, 'forbidden', 100);
      
      setTimeout(() => {
        emitter.emit('forbidden', 'should fail');
      }, 10);
      
      await expect(promise).rejects.toThrow('Unexpected event \'forbidden\' was emitted');
    });
  });

  describe('Event timing and performance', () => {
    it('should track event timing in captured events', async () => {
      const capture = captureEvents(emitter, ['fast', 'slow']);
      
      emitter.emit('fast');
      setTimeout(() => emitter.emit('slow'), 50);
      
      await new Promise(resolve => {
        setTimeout(() => {
          const timing = capture.getSequenceTiming();
          expect(timing).toHaveLength(1);
          expect(timing[0].eventName).toBe('slow');
          expect(timing[0].timeSincePrevious).toBeGreaterThanOrEqual(45);
          
          capture.cleanup();
          resolve();
        }, 100);
      });
    });
  });
});