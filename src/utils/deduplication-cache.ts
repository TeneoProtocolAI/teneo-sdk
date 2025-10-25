/**
 * Deduplication Cache with TTL
 * Prevents duplicate processing of messages/events
 *
 * Uses time-to-live (TTL) for automatic cleanup of old entries
 * without requiring external cleanup timers.
 */

interface CacheEntry {
  timestamp: number;
}

/**
 * TTL-based cache for detecting duplicates
 * Automatically expires entries after configured TTL
 *
 * @example
 * ```typescript
 * const cache = new DeduplicationCache(60000); // 60 second TTL
 *
 * // Check and add in one operation
 * if (!cache.has('message-123')) {
 *   cache.add('message-123');
 *   // Process message
 * } else {
 *   // Duplicate - skip processing
 * }
 * ```
 */
export class DeduplicationCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Creates a new deduplication cache
   *
   * @param ttl - Time-to-live in milliseconds (default: 300000 / 5 minutes)
   * @param maxSize - Maximum cache size before cleanup (default: 10000)
   * @throws {Error} If TTL is less than 1000ms or maxSize is less than 1
   *
   * @example
   * ```typescript
   * // 5 minute TTL, max 10k entries
   * const cache = new DeduplicationCache(300000, 10000);
   * ```
   */
  constructor(
    private readonly ttl: number = 300000,
    private readonly maxSize: number = 10000
  ) {
    if (ttl < 1000) {
      throw new Error("DeduplicationCache TTL must be at least 1000ms");
    }
    if (maxSize < 1) {
      throw new Error("DeduplicationCache maxSize must be at least 1");
    }
  }

  /**
   * Check if a key exists and hasn't expired
   *
   * @param key - Key to check
   * @returns true if key exists and is not expired, false otherwise
   *
   * @example
   * ```typescript
   * if (cache.has('message-id')) {
   *   console.log('Duplicate message detected');
   * }
   * ```
   */
  public has(key: string): boolean {
    this.cleanupIfNeeded();

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Add a key to the cache with current timestamp
   *
   * @param key - Key to add
   * @returns true if added, false if already exists
   *
   * @example
   * ```typescript
   * if (cache.add('message-id')) {
   *   // Process message
   * } else {
   *   // Already processed
   * }
   * ```
   */
  public add(key: string): boolean {
    if (this.has(key)) {
      return false;
    }

    this.cache.set(key, {
      timestamp: Date.now()
    });

    this.cleanupIfNeeded();
    return true;
  }

  /**
   * Remove a specific key from the cache
   *
   * @param key - Key to remove
   * @returns true if key was removed, false if didn't exist
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   *
   * @returns Number of entries in cache
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Get cache configuration
   */
  public getConfig(): { ttl: number; maxSize: number } {
    return {
      ttl: this.ttl,
      maxSize: this.maxSize
    };
  }

  /**
   * Clean up expired entries if cache is getting large
   * Called automatically by has() and add()
   */
  private cleanupIfNeeded(): void {
    // Only cleanup if approaching max size
    if (this.cache.size < this.maxSize * 0.9) {
      return;
    }

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Force cleanup of all expired entries
   * Usually not needed as cleanup is automatic
   *
   * @returns Number of entries removed
   */
  public cleanup(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return keysToDelete.length;
  }
}
