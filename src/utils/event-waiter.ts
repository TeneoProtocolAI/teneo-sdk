/**
 * Event Waiter Utility
 * Provides a clean Promise-based API for waiting for events with timeout and filtering
 * Eliminates callback hell and ensures proper cleanup of listeners and timers
 */

import { EventEmitter } from "eventemitter3";

/**
 * Options for waiting for an event
 */
export interface WaitForEventOptions<T> {
  /**
   * Timeout in milliseconds
   */
  timeout: number;

  /**
   * Optional filter function to match specific events
   * If provided, only events that pass the filter will resolve the promise
   *
   * @param data - The event data
   * @returns true if this is the event we're waiting for, false to keep waiting
   */
  filter?: (data: T) => boolean;

  /**
   * Optional custom timeout error message
   * If not provided, a default message will be used
   */
  timeoutMessage?: string;
}

/**
 * Wait for an event to be emitted with automatic timeout and cleanup
 *
 * This utility encapsulates the complex pattern of:
 * - Setting up event listeners
 * - Managing timeouts
 * - Cleaning up listeners and timers in all code paths
 * - Filtering events
 *
 * All cleanup is guaranteed to happen, preventing memory leaks.
 *
 * @param emitter - The EventEmitter to listen to
 * @param eventName - The name of the event to wait for
 * @param options - Configuration options
 * @returns Promise that resolves with the event data or rejects on timeout
 *
 * @example
 * ```typescript
 * // Simple usage: wait for any 'data' event
 * const data = await waitForEvent(emitter, 'data', { timeout: 5000 });
 *
 * // With filter: wait for specific event
 * const response = await waitForEvent(wsClient, 'agent:response', {
 *   timeout: 30000,
 *   filter: (r) => r.taskId === myTaskId,
 *   timeoutMessage: 'Agent did not respond in time'
 * });
 * ```
 */
export async function waitForEvent<T = any>(
  emitter: EventEmitter,
  eventName: string,
  options: WaitForEventOptions<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | undefined;
    let eventHandler: ((data: T) => void) | undefined;
    let cleaned = false;

    // Cleanup function - ensures we only clean up once
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }

      if (eventHandler) {
        emitter.off(eventName, eventHandler);
        eventHandler = undefined;
      }
    };

    // Event handler - filters and resolves
    eventHandler = (data: T) => {
      // If filter is provided, check if this event matches
      if (options.filter && !options.filter(data)) {
        // Not the event we're looking for, keep waiting
        return;
      }

      // This is the event we want!
      cleanup();
      resolve(data);
    };

    // Timeout handler - rejects after timeout
    timeoutHandle = setTimeout(() => {
      cleanup();
      const message = options.timeoutMessage || `Timeout waiting for event '${eventName}' after ${options.timeout}ms`;
      reject(new Error(message));
    }, options.timeout);

    // Start listening
    emitter.on(eventName, eventHandler);
  });
}

/**
 * Wait for multiple events simultaneously (race condition)
 * Resolves with the first event that fires and matches its filter
 *
 * @param waiters - Array of event waiter configurations
 * @returns Promise that resolves with the first matching event
 *
 * @example
 * ```typescript
 * // Wait for either success or error
 * const result = await waitForAnyEvent([
 *   { emitter: client, eventName: 'auth:success', options: { timeout: 5000 } },
 *   { emitter: client, eventName: 'auth:error', options: { timeout: 5000 } }
 * ]);
 * ```
 */
export async function waitForAnyEvent<T = any>(
  waiters: Array<{
    emitter: EventEmitter;
    eventName: string;
    options: WaitForEventOptions<T>;
  }>
): Promise<T> {
  return Promise.race(
    waiters.map(({ emitter, eventName, options }) =>
      waitForEvent<T>(emitter, eventName, options)
    )
  );
}

/**
 * Wait for all events to fire (all must complete)
 * Useful when you need multiple events to occur before proceeding
 *
 * @param waiters - Array of event waiter configurations
 * @returns Promise that resolves with array of all event data
 *
 * @example
 * ```typescript
 * // Wait for both auth and connection
 * const [authState, connState] = await waitForAllEvents([
 *   { emitter: client, eventName: 'auth:success', options: { timeout: 5000 } },
 *   { emitter: client, eventName: 'connection:open', options: { timeout: 5000 } }
 * ]);
 * ```
 */
export async function waitForAllEvents<T = any>(
  waiters: Array<{
    emitter: EventEmitter;
    eventName: string;
    options: WaitForEventOptions<T>;
  }>
): Promise<T[]> {
  return Promise.all(
    waiters.map(({ emitter, eventName, options }) =>
      waitForEvent<T>(emitter, eventName, options)
    )
  );
}
