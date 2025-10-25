/**
 * Tests for Bounded Queue
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BoundedQueue, QueueOverflowError, type OverflowStrategy } from "./bounded-queue";

describe("BoundedQueue", () => {
  describe("constructor", () => {
    it("should create a queue with specified max size", () => {
      const queue = new BoundedQueue<number>(10);
      expect(queue.getMaxSize()).toBe(10);
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it("should use drop-oldest as default strategy", () => {
      const queue = new BoundedQueue<number>(10);
      expect(queue.getStrategy()).toBe("drop-oldest");
    });

    it("should accept custom strategy", () => {
      const queue = new BoundedQueue<number>(10, "drop-newest");
      expect(queue.getStrategy()).toBe("drop-newest");
    });

    it("should throw error if maxSize is less than 1", () => {
      expect(() => new BoundedQueue<number>(0)).toThrow("maxSize must be at least 1");
      expect(() => new BoundedQueue<number>(-1)).toThrow("maxSize must be at least 1");
    });
  });

  describe("basic operations", () => {
    let queue: BoundedQueue<string>;

    beforeEach(() => {
      queue = new BoundedQueue<string>(5);
    });

    it("should push items to the queue", () => {
      expect(queue.push("a")).toBe(true);
      expect(queue.push("b")).toBe(true);
      expect(queue.size()).toBe(2);
    });

    it("should shift items from the queue (FIFO)", () => {
      queue.push("a");
      queue.push("b");
      queue.push("c");

      expect(queue.shift()).toBe("a");
      expect(queue.shift()).toBe("b");
      expect(queue.shift()).toBe("c");
      expect(queue.size()).toBe(0);
    });

    it("should return undefined when shifting from empty queue", () => {
      expect(queue.shift()).toBeUndefined();
    });

    it("should peek at front item without removing", () => {
      queue.push("a");
      queue.push("b");

      expect(queue.peek()).toBe("a");
      expect(queue.size()).toBe(2); // Size unchanged
      expect(queue.peek()).toBe("a"); // Still the same item
    });

    it("should return undefined when peeking at empty queue", () => {
      expect(queue.peek()).toBeUndefined();
    });

    it("should clear all items", () => {
      queue.push("a");
      queue.push("b");
      queue.push("c");
      expect(queue.size()).toBe(3);

      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it("should detect when queue is full", () => {
      expect(queue.isFull()).toBe(false);

      for (let i = 0; i < 5; i++) {
        queue.push(`item-${i}`);
      }

      expect(queue.isFull()).toBe(true);
    });

    it("should detect when queue is empty", () => {
      expect(queue.isEmpty()).toBe(true);
      queue.push("a");
      expect(queue.isEmpty()).toBe(false);
      queue.shift();
      expect(queue.isEmpty()).toBe(true);
    });

    it("should convert to array", () => {
      queue.push("a");
      queue.push("b");
      queue.push("c");

      const arr = queue.toArray();
      expect(arr).toEqual(["a", "b", "c"]);

      // Should be a copy (not affect original)
      arr.push("d");
      expect(queue.size()).toBe(3);
    });
  });

  describe("drop-oldest strategy", () => {
    let queue: BoundedQueue<number>;

    beforeEach(() => {
      queue = new BoundedQueue<number>(3, "drop-oldest");
    });

    it("should drop oldest item when queue is full", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      // Queue: [1, 2, 3]
      expect(queue.isFull()).toBe(true);

      // Push 4 should drop 1
      const result = queue.push(4);

      expect(result).toBe(true);
      expect(queue.size()).toBe(3);
      expect(queue.toArray()).toEqual([2, 3, 4]);
    });

    it("should continue dropping oldest on subsequent pushes", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      queue.push(4); // Drops 1
      queue.push(5); // Drops 2
      queue.push(6); // Drops 3

      expect(queue.toArray()).toEqual([4, 5, 6]);
    });

    it("should maintain FIFO order after dropping", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      queue.push(4); // Drops 1

      expect(queue.shift()).toBe(2);
      expect(queue.shift()).toBe(3);
      expect(queue.shift()).toBe(4);
    });
  });

  describe("drop-newest strategy", () => {
    let queue: BoundedQueue<number>;

    beforeEach(() => {
      queue = new BoundedQueue<number>(3, "drop-newest");
    });

    it("should reject new item when queue is full", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      // Queue: [1, 2, 3]
      expect(queue.isFull()).toBe(true);

      // Try to push 4
      const result = queue.push(4);

      expect(result).toBe(false); // Rejected
      expect(queue.size()).toBe(3);
      expect(queue.toArray()).toEqual([1, 2, 3]); // Original items preserved
    });

    it("should preserve original items on multiple reject attempts", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      queue.push(4); // Rejected
      queue.push(5); // Rejected
      queue.push(6); // Rejected

      expect(queue.toArray()).toEqual([1, 2, 3]);
    });

    it("should allow push after items are removed", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      queue.shift(); // Remove 1

      const result = queue.push(4);
      expect(result).toBe(true);
      expect(queue.toArray()).toEqual([2, 3, 4]);
    });
  });

  describe("reject strategy", () => {
    let queue: BoundedQueue<number>;

    beforeEach(() => {
      queue = new BoundedQueue<number>(3, "reject");
    });

    it("should throw QueueOverflowError when queue is full", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      expect(() => queue.push(4)).toThrow(QueueOverflowError);
      expect(() => queue.push(4)).toThrow(/Queue is full/);
    });

    it("should not modify queue when overflow error is thrown", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      try {
        queue.push(4);
      } catch (error) {
        // Expected
      }

      expect(queue.toArray()).toEqual([1, 2, 3]);
    });

    it("should allow push after handling overflow error and removing items", () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);

      try {
        queue.push(4);
      } catch (error) {
        queue.shift(); // Remove oldest
      }

      const result = queue.push(4);
      expect(result).toBe(true);
      expect(queue.toArray()).toEqual([2, 3, 4]);
    });
  });

  describe("type safety", () => {
    it("should work with different types", () => {
      interface Task {
        id: number;
        name: string;
      }

      const queue = new BoundedQueue<Task>(3);

      queue.push({ id: 1, name: "task1" });
      queue.push({ id: 2, name: "task2" });

      const task = queue.shift();
      expect(task?.id).toBe(1);
      expect(task?.name).toBe("task1");
    });

    it("should work with complex objects", () => {
      interface WebhookPayload {
        url: string;
        data: any;
        attempts: number;
      }

      const queue = new BoundedQueue<WebhookPayload>(10);

      queue.push({
        url: "https://example.com",
        data: { test: true },
        attempts: 0
      });

      const payload = queue.peek();
      expect(payload?.url).toBe("https://example.com");
      expect(payload?.data.test).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle queue of size 1", () => {
      const queue = new BoundedQueue<string>(1, "drop-oldest");

      queue.push("a");
      expect(queue.size()).toBe(1);

      queue.push("b");
      expect(queue.size()).toBe(1);
      expect(queue.toArray()).toEqual(["b"]);
    });

    it("should handle rapid push and shift operations", () => {
      const queue = new BoundedQueue<number>(5);

      for (let i = 0; i < 100; i++) {
        queue.push(i);
        if (i % 2 === 0) {
          queue.shift();
        }
      }

      expect(queue.size()).toBeLessThanOrEqual(5);
    });

    it("should handle clearing and refilling", () => {
      const queue = new BoundedQueue<number>(3);

      queue.push(1);
      queue.push(2);
      queue.push(3);
      queue.clear();

      expect(queue.isEmpty()).toBe(true);

      queue.push(4);
      queue.push(5);

      expect(queue.toArray()).toEqual([4, 5]);
    });
  });
});

describe("QueueOverflowError", () => {
  it("should be instanceof Error", () => {
    const error = new QueueOverflowError("Test");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(QueueOverflowError);
  });

  it("should have correct name", () => {
    const error = new QueueOverflowError("Test");
    expect(error.name).toBe("QueueOverflowError");
  });

  it("should preserve error message", () => {
    const message = "Custom overflow message";
    const error = new QueueOverflowError(message);
    expect(error.message).toBe(message);
  });
});
