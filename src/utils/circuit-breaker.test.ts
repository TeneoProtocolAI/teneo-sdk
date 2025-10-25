/**
 * Tests for Circuit Breaker
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreaker, CircuitBreakerError, type CircuitState } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  describe("constructor", () => {
    it("should create circuit breaker with default options", () => {
      const breaker = new CircuitBreaker();
      const config = breaker.getConfig();

      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
      expect(config.timeout).toBe(60000);
      expect(config.windowSize).toBe(60000);
    });

    it("should create circuit breaker with custom options", () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 30000,
        windowSize: 30000
      });
      const config = breaker.getConfig();

      expect(config.failureThreshold).toBe(3);
      expect(config.successThreshold).toBe(1);
      expect(config.timeout).toBe(30000);
      expect(config.windowSize).toBe(30000);
    });

    it("should throw error if failureThreshold is less than 1", () => {
      expect(() => new CircuitBreaker({ failureThreshold: 0 })).toThrow(
        "failureThreshold must be at least 1"
      );
    });

    it("should throw error if successThreshold is less than 1", () => {
      expect(() => new CircuitBreaker({ successThreshold: 0 })).toThrow(
        "successThreshold must be at least 1"
      );
    });
  });

  describe("CLOSED state", () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({ failureThreshold: 3 });
    });

    it("should start in CLOSED state", () => {
      const state = breaker.getState();
      expect(state.state).toBe("CLOSED");
      expect(state.failureCount).toBe(0);
    });

    it("should execute operations successfully in CLOSED state", async () => {
      const operation = vi.fn(async () => "success");

      const result = await breaker.execute(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should track failures in CLOSED state", async () => {
      const operation = vi.fn(async () => {
        throw new Error("operation failed");
      });

      await expect(breaker.execute(operation)).rejects.toThrow("operation failed");

      const state = breaker.getState();
      expect(state.failureCount).toBe(1);
      expect(state.state).toBe("CLOSED");
    });

    it("should open circuit after reaching failure threshold", async () => {
      const operation = vi.fn(async () => {
        throw new Error("operation failed");
      });

      // Fail 3 times (threshold = 3)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow("operation failed");
      }

      const state = breaker.getState();
      expect(state.state).toBe("OPEN");
      expect(state.failureCount).toBe(3);
    });

    it("should only count failures within the time window", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        windowSize: 100 // 100ms window
      });

      const operation = vi.fn(async () => {
        throw new Error("failed");
      });

      // First failure
      await expect(breaker.execute(operation)).rejects.toThrow("failed");
      expect(breaker.getState().failureCount).toBe(1);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second failure (first should be outside window now)
      await expect(breaker.execute(operation)).rejects.toThrow("failed");
      expect(breaker.getState().failureCount).toBe(1);
      expect(breaker.getState().state).toBe("CLOSED");
    });
  });

  describe("OPEN state", () => {
    let breaker: CircuitBreaker;

    beforeEach(async () => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 1000
      });

      // Trigger circuit to open
      const failOp = vi.fn(async () => {
        throw new Error("fail");
      });
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(failOp)).rejects.toThrow("fail");
      }
    });

    it("should be in OPEN state after threshold failures", () => {
      const state = breaker.getState();
      expect(state.state).toBe("OPEN");
    });

    it("should fail fast with CircuitBreakerError in OPEN state", async () => {
      const operation = vi.fn(async () => "success");

      await expect(breaker.execute(operation)).rejects.toThrow(CircuitBreakerError);
      await expect(breaker.execute(operation)).rejects.toThrow("Circuit breaker is OPEN");

      // Operation should not be called
      expect(operation).not.toHaveBeenCalled();
    });

    it("should transition to HALF_OPEN after timeout", async () => {
      expect(breaker.getState().state).toBe("OPEN");

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Try operation - should be in HALF_OPEN now
      const operation = vi.fn(async () => "success");
      await breaker.execute(operation);

      expect(operation).toHaveBeenCalled();
    });

    it("should set nextAttemptTime when opening", () => {
      const state = breaker.getState();
      expect(state.nextAttemptTime).toBeDefined();
      expect(state.nextAttemptTime! > Date.now()).toBe(true);
    });
  });

  describe("HALF_OPEN state", () => {
    let breaker: CircuitBreaker;

    beforeEach(async () => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 100 // Short timeout for testing
      });

      // Open the circuit
      const failOp = vi.fn(async () => {
        throw new Error("fail");
      });
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(failOp)).rejects.toThrow("fail");
      }

      // Wait for timeout to move to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    it("should allow operations in HALF_OPEN state", async () => {
      const operation = vi.fn(async () => "success");

      const result = await breaker.execute(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalled();
    });

    it("should close circuit after enough successes", async () => {
      const operation = vi.fn(async () => "success");

      // Need 2 successes (successThreshold = 2)
      await breaker.execute(operation);
      expect(breaker.getState().state).toBe("HALF_OPEN");

      await breaker.execute(operation);
      expect(breaker.getState().state).toBe("CLOSED");
      expect(breaker.getState().failureCount).toBe(0);
    });

    it("should reopen circuit on failure in HALF_OPEN", async () => {
      const operation = vi.fn(async () => {
        throw new Error("failed again");
      });

      await expect(breaker.execute(operation)).rejects.toThrow("failed again");

      const state = breaker.getState();
      expect(state.state).toBe("OPEN");
      expect(state.nextAttemptTime).toBeDefined();
    });

    it("should reset success count when reopening", async () => {
      const successOp = vi.fn(async () => "success");
      const failOp = vi.fn(async () => {
        throw new Error("fail");
      });

      // One success
      await breaker.execute(successOp);
      expect(breaker.getState().successCount).toBe(1);

      // Then fail - should reopen and reset success count
      await expect(breaker.execute(failOp)).rejects.toThrow("fail");
      expect(breaker.getState().state).toBe("OPEN");
      expect(breaker.getState().successCount).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset circuit to CLOSED state", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });

      // Open circuit
      const failOp = vi.fn(async () => {
        throw new Error("fail");
      });
      await expect(breaker.execute(failOp)).rejects.toThrow("fail");

      expect(breaker.getState().state).toBe("OPEN");

      // Reset
      breaker.reset();

      const state = breaker.getState();
      expect(state.state).toBe("CLOSED");
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.lastFailureTime).toBeUndefined();
      expect(state.nextAttemptTime).toBeUndefined();
    });

    it("should allow operations after reset", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });

      // Open circuit
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      breaker.reset();

      // Should work now
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });
  });

  describe("getState", () => {
    it("should return current state and metrics", async () => {
      const breaker = new CircuitBreaker();

      const state1 = breaker.getState();
      expect(state1).toMatchObject({
        state: "CLOSED",
        failureCount: 0,
        successCount: 0
      });

      // Cause a failure
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      const state2 = breaker.getState();
      expect(state2.failureCount).toBe(1);
      expect(state2.lastFailureTime).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle rapid failures", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 10 });

      const operation = vi.fn(async () => {
        throw new Error("fail");
      });

      // Rapid failures
      const promises = Array(10)
        .fill(0)
        .map(() => breaker.execute(operation).catch(() => {}));

      await Promise.all(promises);

      expect(breaker.getState().state).toBe("OPEN");
    });

    it("should handle mixed success/failure in CLOSED", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      let shouldFail = true;
      const operation = vi.fn(async () => {
        if (shouldFail) {
          throw new Error("fail");
        }
        return "success";
      });

      // Fail
      await expect(breaker.execute(operation)).rejects.toThrow("fail");
      expect(breaker.getState().failureCount).toBe(1);

      // Succeed
      shouldFail = false;
      await breaker.execute(operation);
      expect(breaker.getState().failureCount).toBe(0);

      // Should still be CLOSED
      expect(breaker.getState().state).toBe("CLOSED");
    });

    it("should handle synchronous errors", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });

      await expect(
        breaker.execute(async () => {
          throw new Error("sync error");
        })
      ).rejects.toThrow("sync error");

      expect(breaker.getState().state).toBe("OPEN");
    });

    it("should handle operations that return undefined", async () => {
      const breaker = new CircuitBreaker();

      const result = await breaker.execute(async () => undefined);

      expect(result).toBeUndefined();
      expect(breaker.getState().state).toBe("CLOSED");
    });
  });

  describe("CircuitBreakerError", () => {
    it("should be instanceof Error", () => {
      const error = new CircuitBreakerError("Test", "OPEN");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CircuitBreakerError);
    });

    it("should have correct name and state", () => {
      const error = new CircuitBreakerError("Test", "OPEN");
      expect(error.name).toBe("CircuitBreakerError");
      expect(error.state).toBe("OPEN");
    });

    it("should preserve error message", () => {
      const message = "Custom message";
      const error = new CircuitBreakerError(message, "OPEN");
      expect(error.message).toBe(message);
    });
  });
});
