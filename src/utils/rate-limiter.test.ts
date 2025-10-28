/**
 * Tests for Token Bucket Rate Limiter
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenBucketRateLimiter, RateLimitError } from "./rate-limiter";

describe("TokenBucketRateLimiter", () => {
  describe("constructor", () => {
    it("should create a rate limiter with valid parameters", () => {
      const limiter = new TokenBucketRateLimiter(10, 20);
      const config = limiter.getConfig();

      expect(config.tokensPerSecond).toBe(10);
      expect(config.maxBurst).toBe(20);
      expect(limiter.getAvailableTokens()).toBe(20); // Starts full
    });

    it("should throw error if tokensPerSecond is less than 1", () => {
      expect(() => new TokenBucketRateLimiter(0, 10)).toThrow("tokensPerSecond must be at least 1");
      expect(() => new TokenBucketRateLimiter(-1, 10)).toThrow(
        "tokensPerSecond must be at least 1"
      );
    });

    it("should throw error if maxBurst is less than 1", () => {
      expect(() => new TokenBucketRateLimiter(10, 0)).toThrow("maxBurst must be at least 1");
      expect(() => new TokenBucketRateLimiter(10, -1)).toThrow("maxBurst must be at least 1");
    });
  });

  describe("tryConsume", () => {
    it("should consume tokens successfully when available", () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getAvailableTokens()).toBeCloseTo(4, 0);

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getAvailableTokens()).toBeCloseTo(3, 0);
    });

    it("should return false when no tokens available", () => {
      const limiter = new TokenBucketRateLimiter(10, 2);

      // Consume all tokens
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(true);

      // Should fail now
      expect(limiter.tryConsume()).toBe(false);
      expect(limiter.tryConsume()).toBe(false);
    });

    it("should allow burst up to maxBurst", () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      // Should allow 5 rapid operations
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryConsume()).toBe(true);
      }

      // 6th should fail
      expect(limiter.tryConsume()).toBe(false);
    });
  });

  describe("token refill", () => {
    it("should refill tokens over time", async () => {
      // 10 tokens/sec = 1 token per 100ms
      const limiter = new TokenBucketRateLimiter(10, 5);

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryConsume();
      }
      expect(limiter.getAvailableTokens()).toBeCloseTo(0, 0);

      // Wait 250ms (should refill ~2.5 tokens)
      await new Promise((resolve) => setTimeout(resolve, 250));

      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThan(2);
      expect(tokens).toBeLessThan(3);
    });

    it("should cap refill at maxBurst", async () => {
      const limiter = new TokenBucketRateLimiter(100, 5); // Fast refill

      // Wait long enough to refill way past maxBurst
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(limiter.getAvailableTokens()).toBe(5); // Capped at maxBurst
    });

    it("should refill continuously at specified rate", async () => {
      // 20 tokens/sec = 1 token per 50ms
      const limiter = new TokenBucketRateLimiter(20, 10);

      // Consume all
      for (let i = 0; i < 10; i++) {
        limiter.tryConsume();
      }

      // Wait and check refill multiple times
      await new Promise((resolve) => setTimeout(resolve, 100)); // ~2 tokens
      expect(limiter.getAvailableTokens()).toBeGreaterThan(1.5);
      expect(limiter.getAvailableTokens()).toBeLessThan(2.5);

      await new Promise((resolve) => setTimeout(resolve, 100)); // ~4 tokens total
      expect(limiter.getAvailableTokens()).toBeGreaterThan(3.5);
      expect(limiter.getAvailableTokens()).toBeLessThan(4.5);
    });
  });

  describe("consume (blocking)", () => {
    it("should consume immediately when token available", async () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      const start = Date.now();
      await limiter.consume();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be immediate
      expect(limiter.getAvailableTokens()).toBeCloseTo(4, 0);
    });

    it("should wait for token when none available", async () => {
      // 10 tokens/sec = 100ms per token
      const limiter = new TokenBucketRateLimiter(10, 2);

      // Consume all
      limiter.tryConsume();
      limiter.tryConsume();

      const start = Date.now();
      await limiter.consume(); // Should wait ~100ms for refill
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThan(80); // Allow some timing variance
      expect(elapsed).toBeLessThan(200);
    });

    it("should throw RateLimitError when timeout exceeded", async () => {
      const limiter = new TokenBucketRateLimiter(10, 1);

      // Consume token
      limiter.tryConsume();

      // Try to consume with very short timeout (token needs 100ms to refill)
      await expect(limiter.consume(10)).rejects.toThrow(RateLimitError);

      // Reset and try again to verify error message
      limiter.reset();
      limiter.tryConsume();
      await expect(limiter.consume(10)).rejects.toThrow(/Rate limit timeout/);
    });

    it("should succeed within timeout if token becomes available", async () => {
      // 10 tokens/sec = 100ms per token
      const limiter = new TokenBucketRateLimiter(10, 1);

      limiter.tryConsume();

      // Wait with generous timeout
      await expect(limiter.consume(500)).resolves.toBeUndefined();
    });
  });

  describe("reset", () => {
    it("should reset tokens to full capacity", () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      // Consume some tokens
      limiter.tryConsume();
      limiter.tryConsume();
      limiter.tryConsume();
      expect(limiter.getAvailableTokens()).toBeCloseTo(2, 0);

      // Reset
      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it("should reset refill timer", async () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      // Consume all
      for (let i = 0; i < 5; i++) {
        limiter.tryConsume();
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reset should clear any pending refill
      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(5);
    });
  });

  describe("getAvailableTokens", () => {
    it("should return current token count", () => {
      const limiter = new TokenBucketRateLimiter(10, 10);

      expect(limiter.getAvailableTokens()).toBe(10);

      limiter.tryConsume();
      expect(limiter.getAvailableTokens()).toBeCloseTo(9, 0);

      limiter.tryConsume();
      expect(limiter.getAvailableTokens()).toBeCloseTo(8, 0);
    });

    it("should trigger refill before returning", async () => {
      const limiter = new TokenBucketRateLimiter(10, 5);

      // Consume all
      for (let i = 0; i < 5; i++) {
        limiter.tryConsume();
      }

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      // getAvailableTokens should show refilled amount
      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThan(1);
    });
  });

  describe("getConfig", () => {
    it("should return configuration", () => {
      const limiter = new TokenBucketRateLimiter(15, 30);
      const config = limiter.getConfig();

      expect(config).toEqual({
        tokensPerSecond: 15,
        maxBurst: 30
      });
    });
  });

  describe("edge cases", () => {
    it("should handle very high rates", () => {
      const limiter = new TokenBucketRateLimiter(1000, 1000);

      // Should allow 1000 rapid operations
      for (let i = 0; i < 1000; i++) {
        expect(limiter.tryConsume()).toBe(true);
      }

      expect(limiter.tryConsume()).toBe(false);
    });

    it("should handle rate of 1 token per second", async () => {
      const limiter = new TokenBucketRateLimiter(1, 2);

      limiter.tryConsume();
      limiter.tryConsume();

      // Should take ~1 second for next token
      const start = Date.now();
      await limiter.consume();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThan(900);
      expect(elapsed).toBeLessThan(1200);
    });

    it("should handle burst = 1 (no burst)", () => {
      const limiter = new TokenBucketRateLimiter(10, 1);

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(false); // Immediate rate limit
    });

    it("should be reusable after rate limit", async () => {
      const limiter = new TokenBucketRateLimiter(10, 2);

      // Hit rate limit
      limiter.tryConsume();
      limiter.tryConsume();
      expect(limiter.tryConsume()).toBe(false);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should work again
      expect(limiter.tryConsume()).toBe(true);
    });
  });

  describe("concurrent operations", () => {
    it("should handle multiple consume calls correctly", async () => {
      const limiter = new TokenBucketRateLimiter(10, 3);

      // Consume all tokens
      limiter.tryConsume();
      limiter.tryConsume();
      limiter.tryConsume();

      // Start multiple blocking consume calls
      const promises = [limiter.consume(1000), limiter.consume(1000), limiter.consume(1000)];

      // All should eventually succeed as tokens refill
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });
});

describe("RateLimitError", () => {
  it("should be instanceof Error", () => {
    const error = new RateLimitError("Test");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RateLimitError);
  });

  it("should have correct name", () => {
    const error = new RateLimitError("Test");
    expect(error.name).toBe("RateLimitError");
  });

  it("should preserve error message", () => {
    const message = "Custom rate limit message";
    const error = new RateLimitError(message);
    expect(error.message).toBe(message);
  });
});
