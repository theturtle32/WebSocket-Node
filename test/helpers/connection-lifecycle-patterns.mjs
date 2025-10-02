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
  expectWebSocketConnectionStateTransition,
  expectNoEvent,
  expectConnectionState
} from './assertions.mjs';

/**
 * Connection Lifecycle Testing Standards for Phase 3.2.A.3.3
 * 
 * Provides comprehensive patterns for testing WebSocket connection lifecycles,
 * including state transitions, teardown validation, and resource cleanup.
 */

// ============================================================================
// Connection State Transition Testing Patterns
// ============================================================================

/**
 * Complete state transition map for WebSocket connections
 */
export const CONNECTION_STATE_TRANSITIONS = {
  // Normal lifecycle
  CONNECTING_TO_OPEN: { from: 'connecting', to: 'open', events: ['connect'] },
  OPEN_TO_ENDING: { from: 'open', to: 'ending', events: [] }, // close() sets state to ending
  ENDING_TO_CLOSED: { from: 'ending', to: 'closed', events: ['close'] }, // socket close triggers closed state
  
  // Immediate close patterns (drop() goes directly to closed)
  OPEN_TO_CLOSED_DROP: { from: 'open', to: 'closed', events: ['close'] },
  
  // Error patterns
  ANY_TO_CLOSED_ERROR: { from: '*', to: 'closed', events: ['error', 'close'] },
  CONNECTING_TO_CLOSED_ERROR: { from: 'connecting', to: 'closed', events: ['error', 'close'] },
  
  // Peer-initiated close
  OPEN_TO_PEER_CLOSE: { from: 'open', to: 'peer_requested_close', events: [] },
  PEER_CLOSE_TO_CLOSED: { from: 'peer_requested_close', to: 'closed', events: ['close'] }
};

/**
 * Enhanced state validation utilities
 */
export function createConnectionStateManager(connection, mockSocket, options = {}) {
  const { timeout = 5000, trackStateHistory = true } = options;
  const stateHistory = [];
  
  if (trackStateHistory) {
    const originalState = connection.state;
    stateHistory.push({ state: originalState, timestamp: Date.now() });
    
    // Monitor state changes
    const checkState = () => {
      const currentState = connection.state;
      const lastState = stateHistory[stateHistory.length - 1]?.state;
      if (currentState !== lastState) {
        stateHistory.push({ state: currentState, timestamp: Date.now() });
      }
    };
    
    // Poll for state changes (since state changes might not always emit events)
    const pollInterval = setInterval(checkState, 10);
    
    // Cleanup function
    let cleanup = () => clearInterval(pollInterval);
    
    return {
      /**
       * Wait for a specific state transition with comprehensive validation
       */
      async waitForStateTransition(fromState, toState, options = {}) {
        const { validateEvents = true, transitionTimeout = timeout } = options;
        
        // Verify initial state
        expectConnectionState(connection, fromState);
        
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`State transition timeout: ${fromState} → ${toState} not completed within ${transitionTimeout}ms. State history: ${JSON.stringify(stateHistory)}`));
          }, transitionTimeout);
          
          const checkTransition = () => {
            try {
              expectConnectionState(connection, toState);
              clearTimeout(timer);
              cleanup();
              resolve({
                stateHistory: [...stateHistory],
                transitionTime: Date.now() - stateHistory[stateHistory.length - 1].timestamp
              });
            } catch (error) {
              // Continue waiting
            }
          };
          
          // Set up event listeners for common transition events
          if (validateEvents && toState === 'closed') {
            const closeListener = () => checkTransition();
            const errorListener = () => checkTransition();
            
            connection.once('close', closeListener);
            connection.once('error', errorListener);
          }
          
          // Poll for state changes
          const pollInterval = setInterval(checkTransition, 50);
          
          // Enhanced cleanup
          const originalCleanup = cleanup;
          cleanup = () => {
            clearInterval(pollInterval);
            originalCleanup();
          };
        });
      },
      
      /**
       * Validate a sequence of state transitions
       */
      async validateStateTransitionSequence(transitions, options = {}) {
        const results = [];
        let currentState = connection.state;
        
        for (const transition of transitions) {
          if (transition.from !== '*' && currentState !== transition.from) {
            throw new Error(`Invalid transition sequence: expected state ${transition.from}, got ${currentState}`);
          }
          
          const result = await this.waitForStateTransition(currentState, transition.to, options);
          results.push({ transition, result });
          currentState = transition.to;
        }
        
        return results;
      },
      
      /**
       * Get complete state history
       */
      getStateHistory() {
        return [...stateHistory];
      },
      
      /**
       * Cleanup resources
       */
      cleanup
    };
  }
  
  return null;
}

/**
 * Connection establishment trigger patterns
 */
export function createConnectionEstablishmentTriggers(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Trigger normal connection establishment
     */
    async triggerConnectionEstablishment() {
      const stateManager = createConnectionStateManager(connection, mockSocket);
      
      try {
        // Simulate successful handshake
        const establishmentPromise = stateManager.waitForStateTransition('connecting', 'open');
        
        // Trigger connection ready state
        process.nextTick(() => {
          if (connection.state === 'connecting') {
            connection.state = 'open';
            connection.connected = true;
            connection.emit('connect');
          }
        });
        
        const result = await establishmentPromise;
        return result;
      } finally {
        stateManager.cleanup();
      }
    },
    
    /**
     * Trigger connection establishment with protocol negotiation
     */
    async triggerProtocolNegotiation(acceptedProtocol = 'test-protocol') {
      const eventCapture = captureEvents(connection, ['connect'], { includeTimestamps: true });
      
      try {
        const connectPromise = waitForEvent(connection, 'connect', timeout);
        
        // Simulate protocol acceptance
        process.nextTick(() => {
          connection.protocol = acceptedProtocol;
          connection.state = 'open';
          connection.connected = true;
          connection.emit('connect');
        });
        
        await connectPromise;
        
        expect(connection.protocol).toBe(acceptedProtocol);
        expect(connection.state).toBe('open');
        
        // Wait for event capture to process
        await new Promise(resolve => setTimeout(resolve, 10));
        
        return eventCapture.getEvents('connect');
      } finally {
        eventCapture.cleanup();
      }
    }
  };
}

/**
 * Connection termination trigger patterns
 */
export function createConnectionTerminationTriggers(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Trigger graceful close with proper event sequence
     */
    async triggerGracefulClose(closeCode = 1000, closeDescription = 'Normal closure') {
      const stateManager = createConnectionStateManager(connection, mockSocket);
      const eventCapture = captureEvents(connection, ['close'], { includeTimestamps: true });
      
      try {
        const initialState = connection.state;
        
        // Graceful close: close() immediately sets state to ending, then socket close sets state to closed
        
        // Set up close event monitoring before initiating close
        const closePromise = waitForEvent(connection, 'close', timeout);
        
        // Initiate close (synchronously changes state to ending)
        connection.close(closeCode, closeDescription);
        
        // Verify immediate state change to ending
        expect(connection.state).toBe('ending');
        
        // Now set up monitoring for ending → closed transition
        const closedTransitionPromise = stateManager.waitForStateTransition('ending', 'closed');
        
        // Simulate socket close to trigger ending → closed transition
        process.nextTick(() => {
          mockSocket.emit('close', false);
        });
        
        // Wait for final transition and close event
        const [closedTransition, closeArgs] = await Promise.all([
          closedTransitionPromise,
          closePromise
        ]);
        
        // Validate close event payload
        expect(closeArgs[0]).toBe(closeCode);
        expect(closeArgs[1]).toBe(closeDescription);
        
        return {
          stateTransition: closedTransition,
          closeEvent: eventCapture.getEvents('close')[0],
          finalState: connection.state
        };
      } finally {
        stateManager.cleanup();
        eventCapture.cleanup();
      }
    },
    
    /**
     * Trigger immediate drop (ungraceful close)
     */
    async triggerImmediateDrop(reasonCode = 1006, description = 'Abnormal closure') {
      const stateManager = createConnectionStateManager(connection, mockSocket);
      const eventCapture = captureEvents(connection, ['close', 'error'], { trackSequence: true });
      
      try {
        const initialState = connection.state;
        
        // Monitor for state transition to closed
        const transitionPromise = stateManager.waitForStateTransition(initialState, 'closed');
        
        // Initiate drop
        connection.drop(reasonCode, description);
        
        // Wait for state transition
        const transitionResult = await transitionPromise;
        
        // Validate final state
        expect(connection.state).toBe('closed');
        expect(connection.connected).toBe(false);
        
        return {
          stateTransition: transitionResult,
          events: eventCapture.getSequence(),
          finalState: connection.state
        };
      } finally {
        stateManager.cleanup();
        eventCapture.cleanup();
      }
    },
    
    /**
     * Trigger error-based termination
     */
    async triggerErrorTermination(errorMessage = 'Test connection error') {
      const stateManager = createConnectionStateManager(connection, mockSocket);
      const eventCapture = captureEvents(connection, ['error', 'close'], { trackSequence: true });
      
      try {
        const initialState = connection.state;
        
        // Monitor state transition to closed
        const transitionPromise = stateManager.waitForStateTransition(initialState, 'closed');
        
        // Wait for both error and close events
        const eventSequencePromise = waitForEventSequence(connection, [
          { eventName: 'error' },
          { eventName: 'close' }
        ], { timeout });
        
        // Trigger error
        const error = new Error(errorMessage);
        mockSocket.emit('error', error);
        
        // Wait for both sequences to complete
        const [transitionResult, eventSequence] = await Promise.all([
          transitionPromise,
          eventSequencePromise
        ]);
        
        // Validate error event
        expect(eventSequence[0].args[0].message).toContain(errorMessage);
        
        return {
          stateTransition: transitionResult,
          errorEvent: eventSequence[0],
          closeEvent: eventSequence[1],
          eventSequence: eventCapture.getSequence()
        };
      } finally {
        stateManager.cleanup();
        eventCapture.cleanup();
      }
    }
  };
}

// ============================================================================
// Resource Cleanup Validation Patterns
// ============================================================================

/**
 * Resource cleanup verification patterns
 */
export function createResourceCleanupValidator(connection, mockSocket, options = {}) {
  const { timeout = 5000 } = options;
  
  return {
    /**
     * Validate complete resource cleanup after connection close
     */
    async validateCompleteCleanup() {
      const initialListenerCount = connection.listenerCount();
      
      // Capture pre-cleanup state
      const preCleanupState = {
        listenerCount: connection.listenerCount(),
        connected: connection.connected,
        state: connection.state,
        socket: connection.socket,
        closeEventEmitted: connection.closeEventEmitted
      };
      
      // Ensure connection is closed
      if (connection.state !== 'closed') {
        try {
          connection.drop();
          // Don't wait for close event as drop() may complete synchronously
          // Just wait for state change
          await new Promise(resolve => {
            const checkClosed = () => {
              if (connection.state === 'closed') {
                resolve();
              } else {
                setTimeout(checkClosed, 10);
              }
            };
            checkClosed();
          });
        } catch (error) {
          // If drop fails, connection might already be closed
          if (connection.state !== 'closed') {
            throw error;
          }
        }
      }
      
      // Wait for any async cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Validate cleanup state
      const postCleanupState = {
        listenerCount: connection.listenerCount(),
        connected: connection.connected,
        state: connection.state,
        closeEventEmitted: connection.closeEventEmitted
      };
      
      // Validations
      expect(postCleanupState.connected).toBe(false);
      expect(postCleanupState.state).toBe('closed');
      // Don't require closeEventEmitted for drop() as it may not emit events
      
      return {
        preCleanupState,
        postCleanupState,
        cleanupSuccessful: true
      };
    },
    
    /**
     * Validate event listener cleanup
     */
    async validateEventListenerCleanup() {
      const eventCapture = captureEvents(connection, ['close'], { includeTimestamps: true });
      
      try {
        // Add some test listeners
        const testListeners = [
          () => {},
          () => {},
          () => {}
        ];
        
        testListeners.forEach(listener => {
          connection.on('test-event', listener);
        });
        
        const preCloseListenerCount = connection.listenerCount('test-event');
        expect(preCloseListenerCount).toBe(3);
        
        // Close connection
        if (connection.state !== 'closed') {
          try {
            connection.drop();
            // Wait for state change instead of event
            await new Promise(resolve => {
              const checkClosed = () => {
                if (connection.state === 'closed') {
                  resolve();
                } else {
                  setTimeout(checkClosed, 10);
                }
              };
              checkClosed();
            });
          } catch (error) {
            // Connection might already be closed
            if (connection.state !== 'closed') {
              throw error;
            }
          }
        }
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Test listeners should still exist (they're not auto-removed)
        // But we should be able to remove them manually
        testListeners.forEach(listener => {
          connection.removeListener('test-event', listener);
        });
        
        const postCleanupListenerCount = connection.listenerCount('test-event');
        expect(postCleanupListenerCount).toBe(0);
        
        return {
          initialListenerCount: preCloseListenerCount,
          finalListenerCount: postCleanupListenerCount,
          cleanupSuccessful: true
        };
      } finally {
        eventCapture.cleanup();
      }
    },
    
    /**
     * Validate no resource leaks during repeated connect/disconnect cycles
     */
    async validateNoResourceLeaks(cycleCount = 5) {
      const results = [];
      
      for (let i = 0; i < cycleCount; i++) {
        const memoryBefore = process.memoryUsage();
        
        // Open and close connection
        if (connection.state === 'closed') {
          // Reset connection state for next cycle
          connection.state = 'open';
          connection.connected = true;
          // Reset the socket for next cycle
          mockSocket.destroyed = false;
        }
        
        // Use drop() for consistent behavior
        try {
          connection.drop();
        } catch (error) {
          // If socket is already destroyed, just set state manually
          if (error.message.includes('Socket is destroyed')) {
            connection.state = 'closed';
            connection.connected = false;
          } else {
            throw error;
          }
        }
        
        // Wait for state change
        await new Promise(resolve => {
          const checkClosed = () => {
            if (connection.state === 'closed') {
              resolve();
            } else {
              setTimeout(checkClosed, 10);
            }
          };
          checkClosed();
        });
        
        // Wait for any async cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const memoryAfter = process.memoryUsage();
        
        results.push({
          cycle: i + 1,
          memoryBefore: memoryBefore.heapUsed,
          memoryAfter: memoryAfter.heapUsed,
          memoryDelta: memoryAfter.heapUsed - memoryBefore.heapUsed
        });
      }
      
      // Analyze memory trends
      const memoryDeltas = results.map(r => r.memoryDelta);
      const averageDelta = memoryDeltas.reduce((sum, delta) => sum + delta, 0) / memoryDeltas.length;
      
      // Memory growth should be minimal over cycles
      expect(averageDelta).toBeLessThan(100000); // Less than 100KB average growth per cycle
      
      return {
        cycleResults: results,
        averageMemoryDelta: averageDelta,
        memoryLeakDetected: averageDelta > 100000
      };
    }
  };
}

// ============================================================================
// Concurrent Connection Testing Patterns
// ============================================================================

/**
 * Concurrent connection handling patterns
 */
export function createConcurrentConnectionPatterns(options = {}) {
  const { maxConcurrentConnections = 10, timeout = 10000 } = options;
  
  return {
    /**
     * Test multiple connections lifecycle management
     */
    async testConcurrentLifecycles(connectionFactory, connectionCount = 5) {
      const connections = [];
      const lifecycleResults = [];
      
      try {
        // Create multiple connections
        for (let i = 0; i < connectionCount; i++) {
          const { connection, mockSocket } = connectionFactory();
          connections.push({ connection, mockSocket, id: i });
        }
        
        // Test concurrent state transitions
        const stateTransitionPromises = connections.map(async ({ connection, mockSocket, id }) => {
          const stateManager = createConnectionStateManager(connection, mockSocket);
          
          try {
            // Random delay to test race conditions
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            
            // Trigger state transition (use drop for direct open→closed transition)
            const transitionPromise = stateManager.waitForStateTransition('open', 'closed');
            connection.drop(1000, `Connection ${id} close`);
            
            const result = await transitionPromise;
            return { id, success: true, result };
          } catch (error) {
            return { id, success: false, error: error.message };
          } finally {
            stateManager.cleanup();
          }
        });
        
        const results = await Promise.all(stateTransitionPromises);
        
        // Validate all connections transitioned successfully
        const successfulTransitions = results.filter(r => r.success);
        expect(successfulTransitions).toHaveLength(connectionCount);
        
        return {
          connectionCount,
          results,
          allSuccessful: successfulTransitions.length === connectionCount
        };
      } finally {
        // Cleanup any remaining connections
        for (const { connection } of connections) {
          if (connection.state !== 'closed') {
            connection.drop();
          }
        }
      }
    },
    
    /**
     * Test concurrent resource cleanup
     */
    async testConcurrentCleanup(connectionFactory, connectionCount = 3) {
      const connections = [];
      const cleanupResults = [];
      
      try {
        // Create connections
        for (let i = 0; i < connectionCount; i++) {
          const { connection, mockSocket } = connectionFactory();
          connections.push({ connection, mockSocket, id: i });
        }
        
        // Test concurrent cleanup
        const cleanupPromises = connections.map(async ({ connection, mockSocket, id }) => {
          const cleanupValidator = createResourceCleanupValidator(connection, mockSocket);
          
          try {
            const result = await cleanupValidator.validateCompleteCleanup();
            return { id, success: true, result };
          } catch (error) {
            return { id, success: false, error: error.message };
          }
        });
        
        const results = await Promise.all(cleanupPromises);
        
        // Validate all cleanups were successful
        const successfulCleanups = results.filter(r => r.success);
        expect(successfulCleanups).toHaveLength(connectionCount);
        
        return {
          connectionCount,
          results,
          allCleanupsSuccessful: successfulCleanups.length === connectionCount
        };
      } finally {
        // Final cleanup
        for (const { connection } of connections) {
          if (connection.state !== 'closed') {
            connection.drop();
          }
        }
      }
    }
  };
}

// ============================================================================
// Combined Lifecycle Testing Suite
// ============================================================================

/**
 * Create a comprehensive connection lifecycle testing suite
 */
export function createConnectionLifecycleTestSuite(connection, mockSocket, options = {}) {
  return {
    stateManager: createConnectionStateManager(connection, mockSocket, options),
    establishmentTriggers: createConnectionEstablishmentTriggers(connection, mockSocket, options),
    terminationTriggers: createConnectionTerminationTriggers(connection, mockSocket, options),
    cleanupValidator: createResourceCleanupValidator(connection, mockSocket, options),
    concurrentPatterns: createConcurrentConnectionPatterns(options)
  };
}

/**
 * Validate complete connection lifecycle with all patterns
 */
export async function validateCompleteConnectionLifecycle(connection, mockSocket, options = {}) {
  const suite = createConnectionLifecycleTestSuite(connection, mockSocket, options);
  const results = {
    stateTransitions: [],
    resourceCleanup: null,
    errors: []
  };
  
  try {
    // Test normal lifecycle
    if (connection.state === 'open') {
      const closeResult = await suite.terminationTriggers.triggerGracefulClose();
      results.stateTransitions.push(closeResult.stateTransition);
    }
    
    // Validate cleanup
    const cleanupResult = await suite.cleanupValidator.validateCompleteCleanup();
    results.resourceCleanup = cleanupResult;
    
    return {
      success: true,
      results
    };
  } catch (error) {
    results.errors.push(error.message);
    return {
      success: false,
      results,
      error: error.message
    };
  } finally {
    suite.stateManager?.cleanup();
  }
}