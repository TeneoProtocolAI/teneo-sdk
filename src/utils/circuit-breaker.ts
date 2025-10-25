/**
 * Circuit Breaker Pattern Implementation
 * Provides fault tolerance by preventing cascading failures
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

/**
 * Circuit breaker states
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Success count needed to close from half-open (default: 2) */
  successThreshold?: number;
  /** Time in ms to wait before trying half-open (default: 60000) */
  timeout?: number;
  /** Window size in ms for tracking failures (default: 60000) */
  windowSize?: number;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitBreakerError extends Error {
  constructor(message: string, public readonly state: CircuitState) {
    super(message);
    this.name = "CircuitBreakerError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerError);
    }
  }
}

/**
 * Circuit breaker for fault tolerance
 * Prevents cascading failures by failing fast when errors are detected
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   timeout: 60000
 * });
 *
 * try {
 *   await breaker.execute(async () => {
 *     return await fetch('https://api.example.com/data');
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitBreakerError) {
 *     console.log('Circuit is open, failing fast');
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  private readonly failures: number[] = []; // Timestamps of failures

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly windowSize: number;

  /**
   * Creates a new circuit breaker
   *
   * @param options - Configuration options
   * @throws {Error} If thresholds are less than 1
   *
   * @example
   * ```typescript
   * const breaker = new CircuitBreaker({
   *   failureThreshold: 5,  // Open after 5 failures
   *   successThreshold: 2,  // Close after 2 successes
   *   timeout: 60000,       // Wait 60s before trying again
   *   windowSize: 60000     // Track failures in 60s window
   * });
   * ```
   */
  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 60000;
    this.windowSize = options.windowSize ?? 60000;

    if (this.failureThreshold < 1) {
      throw new Error("CircuitBreaker failureThreshold must be at least 1");
    }
    if (this.successThreshold < 1) {
      throw new Error("CircuitBreaker successThreshold must be at least 1");
    }
  }

  /**
   * Execute an operation through the circuit breaker
   *
   * @template T - Return type of the operation
   * @param operation - Async operation to execute
   * @returns Promise resolving to operation result
   * @throws {CircuitBreakerError} If circuit is open
   * @throws Operation error if operation fails
   *
   * @example
   * ```typescript
   * const result = await breaker.execute(async () => {
   *   const response = await fetch(url);
   *   return await response.json();
   * });
   * ```
   */
  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should try to close the circuit
    this.tryTransitionToHalfOpen();

    // If circuit is open, fail fast
    if (this.state === "OPEN") {
      throw new CircuitBreakerError("Circuit breaker is OPEN", this.state);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit breaker state and metrics
   *
   * @returns State object with status and counters
   */
  public getState(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
    nextAttemptTime?: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Get circuit breaker configuration
   */
  public getConfig(): {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    windowSize: number;
  } {
    return {
      failureThreshold: this.failureThreshold,
      successThreshold: this.successThreshold,
      timeout: this.timeout,
      windowSize: this.windowSize
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   * Useful for recovery scenarios or testing
   */
  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    this.failures.length = 0;
  }

  /**
   * Try to transition from OPEN to HALF_OPEN if timeout has passed
   */
  private tryTransitionToHalfOpen(): void {
    if (this.state === "OPEN" && this.nextAttemptTime) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        // Close the circuit - service has recovered
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
        this.failures.length = 0;
        this.lastFailureTime = undefined;
        this.nextAttemptTime = undefined;
      }
    } else if (this.state === "CLOSED") {
      // Reset failure count on success in CLOSED state
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    if (this.state === "HALF_OPEN") {
      // Failed while testing - reopen circuit
      this.state = "OPEN";
      this.nextAttemptTime = now + this.timeout;
      this.successCount = 0;
      return;
    }

    // Track failure with timestamp
    this.failures.push(now);

    // Remove failures outside the window
    const windowStart = now - this.windowSize;
    while (this.failures.length > 0 && this.failures[0]! < windowStart) {
      this.failures.shift();
    }

    // Count failures in current window
    this.failureCount = this.failures.length;

    // Open circuit if threshold exceeded
    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptTime = now + this.timeout;
    }
  }
}
