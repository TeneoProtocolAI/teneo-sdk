/**
 * RetryPolicy - Configurable retry strategy for connection and webhook retries
 * Supports exponential, linear, and constant backoff strategies
 */

import { z } from "zod";

/**
 * Retry strategy types
 */
export type RetryStrategyType = "exponential" | "linear" | "constant";

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  /** Strategy type: exponential, linear, or constant */
  type: RetryStrategyType;
  /** Base delay in milliseconds (first retry delay) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds */
  maxDelay: number;
  /** Maximum number of retry attempts (0 = no retries) */
  maxAttempts: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Backoff multiplier for exponential strategy (default: 2) */
  backoffMultiplier?: number;
}

/**
 * Zod schema for retry strategy validation
 */
export const RetryStrategySchema = z.object({
  type: z.enum(["exponential", "linear", "constant"]),
  baseDelay: z.number().min(0).max(300000), // 0-5 minutes
  maxDelay: z.number().min(0).max(3600000), // 0-1 hour
  maxAttempts: z.number().min(0).max(1000),
  jitter: z.boolean(),
  backoffMultiplier: z.number().min(1).max(10).optional()
});

/**
 * RetryPolicy - Calculates retry delays and determines retry eligibility
 *
 * Supports three retry strategies:
 * - **Exponential**: Delay increases exponentially (e.g., 1s, 2s, 4s, 8s, ...)
 * - **Linear**: Delay increases linearly (e.g., 1s, 2s, 3s, 4s, ...)
 * - **Constant**: Delay remains constant (e.g., 1s, 1s, 1s, 1s, ...)
 *
 * All strategies respect maxDelay cap and support optional jitter.
 *
 * @example
 * ```typescript
 * // Exponential backoff with default multiplier of 2
 * const policy = RetryPolicy.exponential(1000, 60000, 10, true);
 * console.log(policy.calculateDelay(1)); // ~1000ms
 * console.log(policy.calculateDelay(2)); // ~2000ms
 * console.log(policy.calculateDelay(3)); // ~4000ms
 *
 * // Linear backoff
 * const policy = RetryPolicy.linear(2000, 30000, 5, false);
 * console.log(policy.calculateDelay(1)); // 2000ms
 * console.log(policy.calculateDelay(2)); // 4000ms
 * console.log(policy.calculateDelay(3)); // 6000ms
 *
 * // Constant delay
 * const policy = RetryPolicy.constant(5000, 3);
 * console.log(policy.calculateDelay(1)); // 5000ms
 * console.log(policy.calculateDelay(2)); // 5000ms
 * console.log(policy.calculateDelay(3)); // 5000ms
 * ```
 */
export class RetryPolicy {
  private readonly strategy: RetryStrategy;

  /**
   * Creates a new retry policy with the specified strategy
   *
   * @param strategy - Retry strategy configuration
   * @throws {z.ZodError} If strategy is invalid
   */
  constructor(strategy: RetryStrategy) {
    // Validate strategy with Zod
    this.strategy = RetryStrategySchema.parse(strategy);

    // Additional validation: maxDelay must be >= baseDelay
    if (this.strategy.maxDelay < this.strategy.baseDelay) {
      throw new Error("maxDelay must be greater than or equal to baseDelay");
    }
  }

  /**
   * Calculates the retry delay for a given attempt number
   *
   * @param attempt - Attempt number (1-indexed: 1 = first retry)
   * @returns Delay in milliseconds before next retry
   *
   * @example
   * ```typescript
   * const policy = RetryPolicy.exponential(1000, 60000, 10, true);
   *
   * // First retry after 1st failure
   * policy.calculateDelay(1); // ~1000ms (+ jitter if enabled)
   *
   * // Second retry after 2nd failure
   * policy.calculateDelay(2); // ~2000ms (+ jitter if enabled)
   * ```
   */
  public calculateDelay(attempt: number): number {
    // Validate attempt number
    if (attempt < 1) {
      throw new Error("Attempt number must be >= 1");
    }

    let delay: number;

    switch (this.strategy.type) {
      case "exponential": {
        const multiplier = this.strategy.backoffMultiplier || 2;
        delay = this.strategy.baseDelay * Math.pow(multiplier, attempt - 1);
        break;
      }
      case "linear": {
        delay = this.strategy.baseDelay * attempt;
        break;
      }
      case "constant": {
        delay = this.strategy.baseDelay;
        break;
      }
    }

    // Cap at maxDelay
    delay = Math.min(delay, this.strategy.maxDelay);

    // Add jitter if enabled
    if (this.strategy.jitter) {
      // Add random jitter between 0 and 1000ms
      delay += Math.random() * 1000;
    }

    return Math.floor(delay);
  }

  /**
   * Determines if a retry should be attempted based on attempt count
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns True if retry should be attempted, false otherwise
   *
   * @example
   * ```typescript
   * const policy = RetryPolicy.exponential(1000, 60000, 3, false);
   *
   * policy.shouldRetry(1); // true
   * policy.shouldRetry(2); // true
   * policy.shouldRetry(3); // true
   * policy.shouldRetry(4); // false - exceeded maxAttempts
   * ```
   */
  public shouldRetry(attempt: number): boolean {
    return attempt <= this.strategy.maxAttempts;
  }

  /**
   * Gets the retry strategy configuration
   *
   * @returns Copy of the retry strategy
   */
  public getStrategy(): Readonly<RetryStrategy> {
    return { ...this.strategy };
  }

  // Static factory methods for common patterns

  /**
   * Creates a retry policy with exponential backoff
   *
   * Delay formula: `min(baseDelay * multiplier^(attempt-1), maxDelay) + jitter`
   *
   * @param baseDelay - Initial delay in milliseconds
   * @param maxDelay - Maximum delay cap in milliseconds
   * @param maxAttempts - Maximum retry attempts
   * @param jitter - Add random jitter (0-1000ms)
   * @param backoffMultiplier - Exponential multiplier (default: 2)
   * @returns RetryPolicy instance with exponential strategy
   *
   * @example
   * ```typescript
   * // Standard exponential backoff (2^n)
   * const policy = RetryPolicy.exponential(1000, 60000, 10, true);
   *
   * // Faster exponential backoff (3^n)
   * const aggressive = RetryPolicy.exponential(1000, 60000, 10, true, 3);
   * ```
   */
  public static exponential(
    baseDelay: number,
    maxDelay: number,
    maxAttempts: number,
    jitter: boolean,
    backoffMultiplier: number = 2
  ): RetryPolicy {
    return new RetryPolicy({
      type: "exponential",
      baseDelay,
      maxDelay,
      maxAttempts,
      jitter,
      backoffMultiplier
    });
  }

  /**
   * Creates a retry policy with linear backoff
   *
   * Delay formula: `min(baseDelay * attempt, maxDelay) + jitter`
   *
   * @param baseDelay - Delay increment per attempt in milliseconds
   * @param maxDelay - Maximum delay cap in milliseconds
   * @param maxAttempts - Maximum retry attempts
   * @param jitter - Add random jitter (0-1000ms)
   * @returns RetryPolicy instance with linear strategy
   *
   * @example
   * ```typescript
   * // Linear backoff: 2s, 4s, 6s, 8s, ...
   * const policy = RetryPolicy.linear(2000, 30000, 10, false);
   * ```
   */
  public static linear(
    baseDelay: number,
    maxDelay: number,
    maxAttempts: number,
    jitter: boolean
  ): RetryPolicy {
    return new RetryPolicy({
      type: "linear",
      baseDelay,
      maxDelay,
      maxAttempts,
      jitter
    });
  }

  /**
   * Creates a retry policy with constant delay
   *
   * Delay formula: `baseDelay + jitter`
   *
   * @param delay - Constant delay in milliseconds
   * @param maxAttempts - Maximum retry attempts
   * @param jitter - Add random jitter (0-1000ms, default: false)
   * @returns RetryPolicy instance with constant strategy
   *
   * @example
   * ```typescript
   * // Retry every 5 seconds, max 3 times
   * const policy = RetryPolicy.constant(5000, 3);
   * ```
   */
  public static constant(delay: number, maxAttempts: number, jitter: boolean = false): RetryPolicy {
    return new RetryPolicy({
      type: "constant",
      baseDelay: delay,
      maxDelay: delay,
      maxAttempts,
      jitter
    });
  }
}
