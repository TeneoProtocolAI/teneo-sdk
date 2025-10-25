/**
 * Tests for RetryPolicy - Configurable retry strategies
 */

import { describe, it, expect } from "vitest";
import { RetryPolicy, RetryStrategySchema } from "./retry-policy";

describe("RetryPolicy", () => {
  describe("constructor validation", () => {
    it("should create policy with valid strategy", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: true,
        backoffMultiplier: 2
      });

      expect(policy).toBeDefined();
      expect(policy.getStrategy()).toEqual({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: true,
        backoffMultiplier: 2
      });
    });

    it("should reject invalid strategy type", () => {
      expect(() => {
        new RetryPolicy({
          type: "invalid" as any,
          baseDelay: 1000,
          maxDelay: 60000,
          maxAttempts: 10,
          jitter: false
        });
      }).toThrow();
    });

    it("should reject negative baseDelay", () => {
      expect(() => {
        new RetryPolicy({
          type: "exponential",
          baseDelay: -1000,
          maxDelay: 60000,
          maxAttempts: 10,
          jitter: false
        });
      }).toThrow();
    });

    it("should reject negative maxAttempts", () => {
      expect(() => {
        new RetryPolicy({
          type: "exponential",
          baseDelay: 1000,
          maxDelay: 60000,
          maxAttempts: -5,
          jitter: false
        });
      }).toThrow();
    });

    it("should reject maxDelay < baseDelay", () => {
      expect(() => {
        new RetryPolicy({
          type: "exponential",
          baseDelay: 60000,
          maxDelay: 1000,
          maxAttempts: 10,
          jitter: false
        });
      }).toThrow("maxDelay must be greater than or equal to baseDelay");
    });

    it("should accept maxDelay = baseDelay", () => {
      const policy = new RetryPolicy({
        type: "constant",
        baseDelay: 5000,
        maxDelay: 5000,
        maxAttempts: 3,
        jitter: false
      });

      expect(policy).toBeDefined();
    });

    it("should accept zero maxAttempts (no retries)", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 0,
        jitter: false
      });

      expect(policy.shouldRetry(1)).toBe(false);
    });
  });

  describe("exponential backoff strategy", () => {
    it("should calculate exponential delays with multiplier 2", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: false,
        backoffMultiplier: 2
      });

      expect(policy.calculateDelay(1)).toBe(1000); // 1000 * 2^0
      expect(policy.calculateDelay(2)).toBe(2000); // 1000 * 2^1
      expect(policy.calculateDelay(3)).toBe(4000); // 1000 * 2^2
      expect(policy.calculateDelay(4)).toBe(8000); // 1000 * 2^3
      expect(policy.calculateDelay(5)).toBe(16000); // 1000 * 2^4
    });

    it("should calculate exponential delays with multiplier 3", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 100000,
        maxAttempts: 10,
        jitter: false,
        backoffMultiplier: 3
      });

      expect(policy.calculateDelay(1)).toBe(1000); // 1000 * 3^0
      expect(policy.calculateDelay(2)).toBe(3000); // 1000 * 3^1
      expect(policy.calculateDelay(3)).toBe(9000); // 1000 * 3^2
      expect(policy.calculateDelay(4)).toBe(27000); // 1000 * 3^3
    });

    it("should cap delay at maxDelay", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 10000,
        maxAttempts: 10,
        jitter: false,
        backoffMultiplier: 2
      });

      expect(policy.calculateDelay(1)).toBe(1000);
      expect(policy.calculateDelay(2)).toBe(2000);
      expect(policy.calculateDelay(3)).toBe(4000);
      expect(policy.calculateDelay(4)).toBe(8000);
      expect(policy.calculateDelay(5)).toBe(10000); // Capped
      expect(policy.calculateDelay(6)).toBe(10000); // Capped
      expect(policy.calculateDelay(10)).toBe(10000); // Capped
    });

    it("should use default multiplier of 2 when not specified", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 5,
        jitter: false
      });

      expect(policy.calculateDelay(1)).toBe(1000);
      expect(policy.calculateDelay(2)).toBe(2000);
      expect(policy.calculateDelay(3)).toBe(4000);
    });
  });

  describe("linear backoff strategy", () => {
    it("should calculate linear delays", () => {
      const policy = new RetryPolicy({
        type: "linear",
        baseDelay: 2000,
        maxDelay: 30000,
        maxAttempts: 10,
        jitter: false
      });

      expect(policy.calculateDelay(1)).toBe(2000); // 2000 * 1
      expect(policy.calculateDelay(2)).toBe(4000); // 2000 * 2
      expect(policy.calculateDelay(3)).toBe(6000); // 2000 * 3
      expect(policy.calculateDelay(4)).toBe(8000); // 2000 * 4
      expect(policy.calculateDelay(5)).toBe(10000); // 2000 * 5
    });

    it("should cap delay at maxDelay", () => {
      const policy = new RetryPolicy({
        type: "linear",
        baseDelay: 5000,
        maxDelay: 15000,
        maxAttempts: 10,
        jitter: false
      });

      expect(policy.calculateDelay(1)).toBe(5000);
      expect(policy.calculateDelay(2)).toBe(10000);
      expect(policy.calculateDelay(3)).toBe(15000); // Capped
      expect(policy.calculateDelay(4)).toBe(15000); // Capped
      expect(policy.calculateDelay(10)).toBe(15000); // Capped
    });
  });

  describe("constant backoff strategy", () => {
    it("should return constant delay", () => {
      const policy = new RetryPolicy({
        type: "constant",
        baseDelay: 5000,
        maxDelay: 5000,
        maxAttempts: 5,
        jitter: false
      });

      expect(policy.calculateDelay(1)).toBe(5000);
      expect(policy.calculateDelay(2)).toBe(5000);
      expect(policy.calculateDelay(3)).toBe(5000);
      expect(policy.calculateDelay(10)).toBe(5000);
      expect(policy.calculateDelay(100)).toBe(5000);
    });
  });

  describe("jitter", () => {
    it("should add jitter when enabled", () => {
      const policy = new RetryPolicy({
        type: "constant",
        baseDelay: 5000,
        maxDelay: 5000,
        maxAttempts: 5,
        jitter: true
      });

      // Jitter adds 0-1000ms, so delay should be between 5000 and 6000
      const delay1 = policy.calculateDelay(1);
      const delay2 = policy.calculateDelay(1);

      expect(delay1).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeLessThanOrEqual(6000);
      expect(delay2).toBeGreaterThanOrEqual(5000);
      expect(delay2).toBeLessThanOrEqual(6000);

      // Should be random (very unlikely to be exactly equal)
      // Run multiple times to verify randomness
      const delays = Array.from({ length: 10 }, () => policy.calculateDelay(1));
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1); // Should have variation
    });

    it("should not add jitter when disabled", () => {
      const policy = new RetryPolicy({
        type: "constant",
        baseDelay: 5000,
        maxDelay: 5000,
        maxAttempts: 5,
        jitter: false
      });

      const delays = Array.from({ length: 10 }, () => policy.calculateDelay(1));

      // All delays should be exactly 5000
      delays.forEach((delay) => {
        expect(delay).toBe(5000);
      });
    });

    it("should add jitter to exponential backoff", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 5,
        jitter: true,
        backoffMultiplier: 2
      });

      // First attempt: 1000ms base + 0-1000ms jitter
      const delay1 = policy.calculateDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(2000);

      // Second attempt: 2000ms base + 0-1000ms jitter
      const delay2 = policy.calculateDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(3000);
    });
  });

  describe("shouldRetry", () => {
    it("should allow retries within maxAttempts", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 3,
        jitter: false
      });

      expect(policy.shouldRetry(1)).toBe(true);
      expect(policy.shouldRetry(2)).toBe(true);
      expect(policy.shouldRetry(3)).toBe(true);
    });

    it("should reject retries beyond maxAttempts", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 3,
        jitter: false
      });

      expect(policy.shouldRetry(4)).toBe(false);
      expect(policy.shouldRetry(5)).toBe(false);
      expect(policy.shouldRetry(100)).toBe(false);
    });

    it("should reject all retries when maxAttempts is 0", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 0,
        jitter: false
      });

      expect(policy.shouldRetry(1)).toBe(false);
      expect(policy.shouldRetry(2)).toBe(false);
    });
  });

  describe("calculateDelay edge cases", () => {
    it("should throw error for attempt < 1", () => {
      const policy = RetryPolicy.exponential(1000, 60000, 10, false);

      expect(() => policy.calculateDelay(0)).toThrow("Attempt number must be >= 1");
      expect(() => policy.calculateDelay(-1)).toThrow("Attempt number must be >= 1");
    });

    it("should handle very large attempt numbers", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 100,
        jitter: false,
        backoffMultiplier: 2
      });

      // Should cap at maxDelay
      expect(policy.calculateDelay(100)).toBe(60000);
      expect(policy.calculateDelay(1000)).toBe(60000);
    });

    it("should return integer delays", () => {
      const policy = new RetryPolicy({
        type: "exponential",
        baseDelay: 333,
        maxDelay: 10000,
        maxAttempts: 10,
        jitter: false,
        backoffMultiplier: 2
      });

      const delay = policy.calculateDelay(3);
      expect(Number.isInteger(delay)).toBe(true);
    });
  });

  describe("getStrategy", () => {
    it("should return copy of strategy", () => {
      const originalStrategy = {
        type: "exponential" as const,
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: true,
        backoffMultiplier: 2
      };

      const policy = new RetryPolicy(originalStrategy);
      const returnedStrategy = policy.getStrategy();

      expect(returnedStrategy).toEqual(originalStrategy);
      expect(returnedStrategy).not.toBe(originalStrategy); // Different reference
    });

    it("should return immutable strategy", () => {
      const policy = RetryPolicy.exponential(1000, 60000, 10, true);
      const strategy = policy.getStrategy();

      // Attempt to mutate
      (strategy as any).maxAttempts = 999;

      // Original should be unchanged
      expect(policy.getStrategy().maxAttempts).toBe(10);
    });
  });

  describe("factory methods", () => {
    describe("exponential", () => {
      it("should create exponential policy with default multiplier", () => {
        const policy = RetryPolicy.exponential(1000, 60000, 10, true);

        expect(policy.getStrategy()).toEqual({
          type: "exponential",
          baseDelay: 1000,
          maxDelay: 60000,
          maxAttempts: 10,
          jitter: true,
          backoffMultiplier: 2
        });
      });

      it("should create exponential policy with custom multiplier", () => {
        const policy = RetryPolicy.exponential(1000, 60000, 10, false, 3);

        expect(policy.getStrategy().backoffMultiplier).toBe(3);
        expect(policy.calculateDelay(2)).toBe(3000); // 1000 * 3^1
      });
    });

    describe("linear", () => {
      it("should create linear policy", () => {
        const policy = RetryPolicy.linear(2000, 30000, 5, false);

        expect(policy.getStrategy()).toEqual({
          type: "linear",
          baseDelay: 2000,
          maxDelay: 30000,
          maxAttempts: 5,
          jitter: false
        });

        expect(policy.calculateDelay(3)).toBe(6000);
      });
    });

    describe("constant", () => {
      it("should create constant policy with default jitter", () => {
        const policy = RetryPolicy.constant(5000, 3);

        expect(policy.getStrategy()).toEqual({
          type: "constant",
          baseDelay: 5000,
          maxDelay: 5000,
          maxAttempts: 3,
          jitter: false
        });

        expect(policy.calculateDelay(1)).toBe(5000);
        expect(policy.calculateDelay(2)).toBe(5000);
      });

      it("should create constant policy with jitter", () => {
        const policy = RetryPolicy.constant(5000, 3, true);

        expect(policy.getStrategy().jitter).toBe(true);

        const delay = policy.calculateDelay(1);
        expect(delay).toBeGreaterThanOrEqual(5000);
        expect(delay).toBeLessThanOrEqual(6000);
      });
    });
  });

  describe("RetryStrategySchema validation", () => {
    it("should validate valid strategy", () => {
      const result = RetryStrategySchema.safeParse({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: true,
        backoffMultiplier: 2
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid type", () => {
      const result = RetryStrategySchema.safeParse({
        type: "invalid",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 10,
        jitter: true
      });

      expect(result.success).toBe(false);
    });

    it("should reject baseDelay out of range", () => {
      const result = RetryStrategySchema.safeParse({
        type: "exponential",
        baseDelay: 500000, // > 300000 max
        maxDelay: 600000,
        maxAttempts: 10,
        jitter: true
      });

      expect(result.success).toBe(false);
    });

    it("should reject maxAttempts out of range", () => {
      const result = RetryStrategySchema.safeParse({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 60000,
        maxAttempts: 2000, // > 1000 max
        jitter: true
      });

      expect(result.success).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle WebSocket reconnection pattern", () => {
      // Typical WebSocket reconnection: exponential with jitter
      const policy = RetryPolicy.exponential(5000, 60000, 10, true, 2);

      // First retry: 5s base + jitter
      const delay1 = policy.calculateDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeLessThanOrEqual(6000);

      // Fifth retry: 80s base capped at 60s + jitter
      const delay5 = policy.calculateDelay(5);
      expect(delay5).toBeGreaterThanOrEqual(60000);
      expect(delay5).toBeLessThanOrEqual(61000);

      expect(policy.shouldRetry(10)).toBe(true);
      expect(policy.shouldRetry(11)).toBe(false);
    });

    it("should handle webhook retry pattern", () => {
      // Typical webhook retry: exponential without jitter
      const policy = RetryPolicy.exponential(1000, 30000, 3, false, 2);

      expect(policy.calculateDelay(1)).toBe(1000); // 1s
      expect(policy.calculateDelay(2)).toBe(2000); // 2s
      expect(policy.calculateDelay(3)).toBe(4000); // 4s

      expect(policy.shouldRetry(3)).toBe(true);
      expect(policy.shouldRetry(4)).toBe(false);
    });

    it("should handle test environment constant delays", () => {
      // For tests: predictable constant delays
      const policy = RetryPolicy.constant(100, 5, false);

      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(100);
      expect(policy.calculateDelay(3)).toBe(100);
    });
  });
});
