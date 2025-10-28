/**
 * Token Bucket Rate Limiter
 * Prevents message flooding and ensures fair resource usage
 *
 * Uses the token bucket algorithm: tokens are added at a constant rate,
 * and each operation consumes one token. When no tokens are available,
 * operations must wait until tokens are replenished.
 */

/**
 * Error thrown when rate limit is exceeded with tryConsume()
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError);
    }
  }
}

/**
 * Token bucket rate limiter for controlling operation frequency
 *
 * @example
 * ```typescript
 * // Allow 10 messages per second with burst of 20
 * const limiter = new TokenBucketRateLimiter(10, 20);
 *
 * // Non-blocking check
 * if (limiter.tryConsume()) {
 *   await sendMessage(msg);
 * } else {
 *   console.log('Rate limit exceeded');
 * }
 *
 * // Blocking wait (auto-waits for token)
 * await limiter.consume();
 * await sendMessage(msg);
 * ```
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly refillInterval: number; // ms per token

  /**
   * Creates a new token bucket rate limiter
   *
   * @param tokensPerSecond - Rate at which tokens are added (operations per second)
   * @param maxBurst - Maximum tokens that can accumulate (burst capacity)
   * @throws {Error} If tokensPerSecond or maxBurst is less than 1
   *
   * @example
   * ```typescript
   * // 10 ops/sec, burst up to 20
   * const limiter = new TokenBucketRateLimiter(10, 20);
   * ```
   */
  constructor(
    private readonly tokensPerSecond: number,
    private readonly maxBurst: number
  ) {
    if (tokensPerSecond < 1) {
      throw new Error("TokenBucketRateLimiter tokensPerSecond must be at least 1");
    }
    if (maxBurst < 1) {
      throw new Error("TokenBucketRateLimiter maxBurst must be at least 1");
    }

    this.tokens = maxBurst; // Start with full bucket
    this.lastRefill = Date.now();
    this.refillInterval = 1000 / tokensPerSecond; // ms between tokens
  }

  /**
   * Try to consume one token without blocking
   *
   * @returns true if token was consumed, false if no tokens available
   *
   * @example
   * ```typescript
   * if (limiter.tryConsume()) {
   *   // Proceed with operation
   * } else {
   *   // Rate limited - handle accordingly
   * }
   * ```
   */
  public tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Consume one token, waiting if necessary until a token is available
   *
   * @param timeout - Optional max wait time in ms (default: no timeout)
   * @returns Promise that resolves when token is consumed
   * @throws {RateLimitError} If timeout is exceeded
   *
   * @example
   * ```typescript
   * // Wait indefinitely for token
   * await limiter.consume();
   *
   * // Wait max 5 seconds
   * try {
   *   await limiter.consume(5000);
   * } catch (error) {
   *   console.log('Timeout waiting for rate limit');
   * }
   * ```
   */
  public async consume(timeout?: number): Promise<void> {
    const startTime = Date.now();

    while (true) {
      if (this.tryConsume()) {
        return;
      }

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (timeout !== undefined && elapsed >= timeout) {
        throw new RateLimitError(`Rate limit timeout: no token available after ${timeout}ms`);
      }

      // Calculate wait time until next token
      // If timeout is specified, don't wait longer than remaining timeout
      const baseWaitTime = Math.min(this.refillInterval, 100);
      const waitTime =
        timeout !== undefined ? Math.min(baseWaitTime, timeout - elapsed) : baseWaitTime;

      // If waitTime is very small or negative, check timeout immediately
      if (waitTime <= 0) {
        continue;
      }

      await this.sleep(waitTime);
    }
  }

  /**
   * Get the number of tokens currently available
   * Refills tokens before returning count
   *
   * @returns Number of tokens available (may be fractional before consumption)
   */
  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get rate limiter configuration
   *
   * @returns Configuration object with rate and burst capacity
   */
  public getConfig(): { tokensPerSecond: number; maxBurst: number } {
    return {
      tokensPerSecond: this.tokensPerSecond,
      maxBurst: this.maxBurst
    };
  }

  /**
   * Reset the rate limiter to full capacity
   * Useful for testing or manual reset scenarios
   */
  public reset(): void {
    this.tokens = this.maxBurst;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time since last refill
   * Called automatically before token consumption
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed > 0) {
      // Calculate tokens to add based on elapsed time
      const tokensToAdd = elapsed / this.refillInterval;

      // Add tokens, capped at maxBurst
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxBurst);
      this.lastRefill = now;
    }
  }

  /**
   * Sleep helper for async waiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
