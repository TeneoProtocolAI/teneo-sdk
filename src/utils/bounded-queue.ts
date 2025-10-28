/**
 * Bounded Queue with Overflow Strategies
 * Prevents unbounded memory growth by enforcing a maximum size
 *
 * This queue prevents the OOM (Out of Memory) issues that can occur
 * with unbounded queues when producers outpace consumers (e.g., webhook
 * delivery failures causing queue buildup).
 */

/**
 * Strategy for handling queue overflow when at max capacity
 */
export type OverflowStrategy =
  | "drop-oldest" // Remove oldest item to make room (FIFO eviction)
  | "drop-newest" // Reject new item, keep existing (preserve old data)
  | "reject"; // Throw error, let caller handle (fail-fast)

/**
 * A queue with a maximum size limit and configurable overflow behavior
 *
 * @template T The type of items stored in the queue
 *
 * @example
 * ```typescript
 * // Create queue that drops oldest items when full
 * const queue = new BoundedQueue<Message>(1000, 'drop-oldest');
 *
 * queue.push(message1); // returns true
 * queue.push(message2); // returns true
 *
 * const msg = queue.shift(); // Remove from front
 * const peek = queue.peek(); // Look at front without removing
 *
 * if (queue.isFull()) {
 *   console.log('Queue at capacity');
 * }
 * ```
 */
export class BoundedQueue<T> {
  private queue: T[] = [];

  /**
   * Creates a new bounded queue
   *
   * @param maxSize Maximum number of items the queue can hold
   * @param strategy How to handle overflow when queue is full
   * @throws {Error} If maxSize is less than 1
   */
  constructor(
    private readonly maxSize: number,
    private readonly strategy: OverflowStrategy = "drop-oldest"
  ) {
    if (maxSize < 1) {
      throw new Error("BoundedQueue maxSize must be at least 1");
    }
  }

  /**
   * Add an item to the end of the queue
   *
   * Behavior when queue is full depends on strategy:
   * - 'drop-oldest': Removes oldest item, adds new item, returns true
   * - 'drop-newest': Rejects new item, returns false
   * - 'reject': Throws QueueOverflowError
   *
   * @param item Item to add to the queue
   * @returns true if item was added, false if rejected (drop-newest strategy only)
   * @throws {QueueOverflowError} If strategy is 'reject' and queue is full
   */
  public push(item: T): boolean {
    if (this.queue.length >= this.maxSize) {
      return this.handleOverflow(item);
    }

    this.queue.push(item);
    return true;
  }

  /**
   * Remove and return the item at the front of the queue
   *
   * @returns The item at the front, or undefined if queue is empty
   */
  public shift(): T | undefined {
    return this.queue.shift();
  }

  /**
   * Look at the item at the front of the queue without removing it
   *
   * @returns The item at the front, or undefined if queue is empty
   */
  public peek(): T | undefined {
    return this.queue[0];
  }

  /**
   * Remove all items from the queue
   */
  public clear(): void {
    this.queue = [];
  }

  /**
   * Get the current number of items in the queue
   *
   * @returns Number of items currently in the queue
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is at maximum capacity
   *
   * @returns true if queue is full, false otherwise
   */
  public isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Check if the queue is empty
   *
   * @returns true if queue has no items, false otherwise
   */
  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get the maximum capacity of the queue
   *
   * @returns The maximum number of items the queue can hold
   */
  public getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Get the current overflow strategy
   *
   * @returns The configured overflow strategy
   */
  public getStrategy(): OverflowStrategy {
    return this.strategy;
  }

  /**
   * Get all items in the queue (for inspection/debugging)
   * Returns a copy to prevent external modification
   *
   * @returns Array of all items in the queue (oldest to newest)
   */
  public toArray(): T[] {
    return [...this.queue];
  }

  /**
   * Handle queue overflow based on configured strategy
   *
   * @param item The item attempting to be added
   * @returns true if item was added, false if rejected
   * @throws {QueueOverflowError} If strategy is 'reject'
   */
  private handleOverflow(item: T): boolean {
    switch (this.strategy) {
      case "drop-oldest":
        // Remove oldest item and add new one
        this.queue.shift();
        this.queue.push(item);
        return true;

      case "drop-newest":
        // Reject the new item
        return false;

      case "reject":
        // Throw error - let caller handle
        throw new QueueOverflowError(
          `Queue is full (max size: ${this.maxSize}). Cannot add more items.`
        );

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = this.strategy;
        throw new Error(`Unknown overflow strategy: ${_exhaustive}`);
    }
  }
}

/**
 * Error thrown when attempting to add to a full queue with 'reject' strategy
 */
export class QueueOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueOverflowError";

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QueueOverflowError);
    }
  }
}
