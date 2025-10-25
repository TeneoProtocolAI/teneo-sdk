/**
 * Tests for Deduplication Cache
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeduplicationCache } from "./deduplication-cache";

describe("DeduplicationCache", () => {
  describe("constructor", () => {
    it("should create cache with default options", () => {
      const cache = new DeduplicationCache();
      const config = cache.getConfig();

      expect(config.ttl).toBe(300000); // 5 minutes
      expect(config.maxSize).toBe(10000);
      expect(cache.size()).toBe(0);
    });

    it("should create cache with custom options", () => {
      const cache = new DeduplicationCache(60000, 5000);
      const config = cache.getConfig();

      expect(config.ttl).toBe(60000);
      expect(config.maxSize).toBe(5000);
    });

    it("should throw error if TTL is less than 1000ms", () => {
      expect(() => new DeduplicationCache(999)).toThrow(
        "TTL must be at least 1000ms"
      );
    });

    it("should throw error if maxSize is less than 1", () => {
      expect(() => new DeduplicationCache(5000, 0)).toThrow(
        "maxSize must be at least 1"
      );
    });
  });

  describe("has", () => {
    let cache: DeduplicationCache;

    beforeEach(() => {
      cache = new DeduplicationCache(60000);
    });

    it("should return false for non-existent keys", () => {
      expect(cache.has("non-existent")).toBe(false);
    });

    it("should return true for existing keys", () => {
      cache.add("key1");
      expect(cache.has("key1")).toBe(true);
    });

    it("should return false for expired keys", async () => {
      const cache = new DeduplicationCache(1000); // 1 second TTL

      cache.add("key1");
      expect(cache.has("key1")).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.has("key1")).toBe(false);
    });

    it("should remove expired keys when checking", async () => {
      const cache = new DeduplicationCache(1000);

      cache.add("key1");
      expect(cache.size()).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      cache.has("key1");
      expect(cache.size()).toBe(0);
    });
  });

  describe("add", () => {
    let cache: DeduplicationCache;

    beforeEach(() => {
      cache = new DeduplicationCache();
    });

    it("should add new keys successfully", () => {
      expect(cache.add("key1")).toBe(true);
      expect(cache.has("key1")).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it("should return false when adding duplicate keys", () => {
      cache.add("key1");
      expect(cache.add("key1")).toBe(false);
      expect(cache.size()).toBe(1);
    });

    it("should allow re-adding expired keys", async () => {
      const cache = new DeduplicationCache(1000);

      cache.add("key1");
      expect(cache.has("key1")).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.add("key1")).toBe(true);
      expect(cache.has("key1")).toBe(true);
    });

    it("should add multiple unique keys", () => {
      cache.add("key1");
      cache.add("key2");
      cache.add("key3");

      expect(cache.size()).toBe(3);
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(true);
      expect(cache.has("key3")).toBe(true);
    });
  });

  describe("delete", () => {
    let cache: DeduplicationCache;

    beforeEach(() => {
      cache = new DeduplicationCache();
    });

    it("should delete existing keys", () => {
      cache.add("key1");
      expect(cache.size()).toBe(1);

      expect(cache.delete("key1")).toBe(true);
      expect(cache.size()).toBe(0);
      expect(cache.has("key1")).toBe(false);
    });

    it("should return false when deleting non-existent keys", () => {
      expect(cache.delete("non-existent")).toBe(false);
    });

    it("should only delete specified key", () => {
      cache.add("key1");
      cache.add("key2");
      cache.add("key3");

      cache.delete("key2");

      expect(cache.size()).toBe(2);
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(false);
      expect(cache.has("key3")).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      const cache = new DeduplicationCache();

      cache.add("key1");
      cache.add("key2");
      cache.add("key3");
      expect(cache.size()).toBe(3);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(false);
      expect(cache.has("key3")).toBe(false);
    });

    it("should work on empty cache", () => {
      const cache = new DeduplicationCache();
      expect(() => cache.clear()).not.toThrow();
      expect(cache.size()).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", async () => {
      const cache = new DeduplicationCache(1000);

      cache.add("key1");
      cache.add("key2");
      cache.add("key3");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const removed = cache.cleanup();

      expect(removed).toBe(3);
      expect(cache.size()).toBe(0);
    });

    it("should not remove non-expired entries", async () => {
      const cache = new DeduplicationCache(1000);

      cache.add("key1");

      // Wait less than TTL
      await new Promise((resolve) => setTimeout(resolve, 500));

      const removed = cache.cleanup();

      expect(removed).toBe(0);
      expect(cache.size()).toBe(1);
    });

    it("should only remove expired entries", async () => {
      const cache = new DeduplicationCache(1000);

      cache.add("key1");

      // Wait for key1 to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Add fresh key
      cache.add("key2");

      const removed = cache.cleanup();

      expect(removed).toBe(1);
      expect(cache.size()).toBe(1);
      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(true);
    });

    it("should return 0 if no entries expired", () => {
      const cache = new DeduplicationCache();

      cache.add("key1");
      cache.add("key2");

      const removed = cache.cleanup();

      expect(removed).toBe(0);
      expect(cache.size()).toBe(2);
    });
  });

  describe("automatic cleanup", () => {
    it("should trigger cleanup when approaching max size", () => {
      const cache = new DeduplicationCache(1000, 10); // Small size for testing

      // Add entries up to 90% capacity (9 items)
      for (let i = 0; i < 9; i++) {
        cache.add(`key${i}`);
      }

      expect(cache.size()).toBe(9);

      // 10th item should trigger cleanup check
      cache.add("key9");

      // All items should still be present (not expired yet)
      expect(cache.size()).toBe(10);
    });

    it("should clean up expired entries when triggered", async () => {
      const cache = new DeduplicationCache(1000, 10);

      // Add entries
      for (let i = 0; i < 9; i++) {
        cache.add(`key${i}`);
      }

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Trigger cleanup by adding 10th item
      cache.add("key9");

      // Old items should be cleaned up, only new item remains
      expect(cache.size()).toBe(1);
      expect(cache.has("key9")).toBe(true);
    });
  });

  describe("size", () => {
    it("should return 0 for empty cache", () => {
      const cache = new DeduplicationCache();
      expect(cache.size()).toBe(0);
    });

    it("should return correct size after additions", () => {
      const cache = new DeduplicationCache();

      cache.add("key1");
      expect(cache.size()).toBe(1);

      cache.add("key2");
      expect(cache.size()).toBe(2);

      cache.add("key3");
      expect(cache.size()).toBe(3);
    });

    it("should return correct size after deletions", () => {
      const cache = new DeduplicationCache();

      cache.add("key1");
      cache.add("key2");
      cache.add("key3");
      expect(cache.size()).toBe(3);

      cache.delete("key2");
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle very short TTL", async () => {
      const cache = new DeduplicationCache(1000); // 1 second

      cache.add("key1");
      expect(cache.has("key1")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.has("key1")).toBe(false);
    });

    it("should handle many entries", () => {
      const cache = new DeduplicationCache(60000, 20000);

      for (let i = 0; i < 1000; i++) {
        cache.add(`key${i}`);
      }

      expect(cache.size()).toBe(1000);

      for (let i = 0; i < 1000; i++) {
        expect(cache.has(`key${i}`)).toBe(true);
      }
    });

    it("should handle rapid add/has operations", () => {
      const cache = new DeduplicationCache();

      for (let i = 0; i < 100; i++) {
        const key = `key${i}`;
        expect(cache.add(key)).toBe(true);
        expect(cache.has(key)).toBe(true);
        expect(cache.add(key)).toBe(false); // Duplicate
      }

      expect(cache.size()).toBe(100);
    });

    it("should handle empty string keys", () => {
      const cache = new DeduplicationCache();

      expect(cache.add("")).toBe(true);
      expect(cache.has("")).toBe(true);
      expect(cache.delete("")).toBe(true);
    });

    it("should treat different keys as separate entries", () => {
      const cache = new DeduplicationCache();

      cache.add("key");
      cache.add("key ");
      cache.add("KEY");

      expect(cache.size()).toBe(3);
      expect(cache.has("key")).toBe(true);
      expect(cache.has("key ")).toBe(true);
      expect(cache.has("KEY")).toBe(true);
    });
  });
});
