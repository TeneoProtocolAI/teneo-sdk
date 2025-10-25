/**
 * Tests for Event Waiter Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "eventemitter3";
import { waitForEvent, waitForAnyEvent, waitForAllEvents } from "./event-waiter";

describe("waitForEvent", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("basic functionality", () => {
    it("should resolve when event is emitted", async () => {
      const eventData = { message: "test data" };

      // Start waiting
      const promise = waitForEvent(emitter, "test:event", { timeout: 5000 });

      // Emit the event
      emitter.emit("test:event", eventData);

      // Should resolve with the event data
      await expect(promise).resolves.toEqual(eventData);
    });

    it("should resolve with the correct event data type", async () => {
      interface TestData {
        id: number;
        name: string;
      }

      const eventData: TestData = { id: 123, name: "test" };

      const promise = waitForEvent<TestData>(emitter, "typed:event", {
        timeout: 5000
      });

      emitter.emit("typed:event", eventData);

      const result = await promise;
      expect(result.id).toBe(123);
      expect(result.name).toBe("test");
    });

    it("should work with multiple sequential waits", async () => {
      const promise1 = waitForEvent(emitter, "event1", { timeout: 5000 });
      emitter.emit("event1", "data1");
      await expect(promise1).resolves.toBe("data1");

      const promise2 = waitForEvent(emitter, "event2", { timeout: 5000 });
      emitter.emit("event2", "data2");
      await expect(promise2).resolves.toBe("data2");
    });
  });

  describe("timeout handling", () => {
    it("should reject after timeout", async () => {
      const promise = waitForEvent(emitter, "never:happens", { timeout: 1000 });

      // Advance time past timeout
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(/Timeout waiting for event/);
    });

    it("should use custom timeout message", async () => {
      const customMessage = "Custom timeout error";
      const promise = waitForEvent(emitter, "never:happens", {
        timeout: 1000,
        timeoutMessage: customMessage
      });

      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(customMessage);
    });

    it("should not timeout if event arrives in time", async () => {
      const promise = waitForEvent(emitter, "quick:event", { timeout: 5000 });

      // Emit before timeout
      vi.advanceTimersByTime(2000);
      emitter.emit("quick:event", "success");

      await expect(promise).resolves.toBe("success");
    });
  });

  describe("filtering", () => {
    it("should filter events and wait for matching one", async () => {
      interface Task {
        taskId: string;
        result: string;
      }

      const promise = waitForEvent<Task>(emitter, "task:response", {
        timeout: 5000,
        filter: (data) => data.taskId === "task-123"
      });

      // Emit non-matching events
      emitter.emit("task:response", { taskId: "task-999", result: "wrong" });
      emitter.emit("task:response", { taskId: "task-888", result: "wrong" });

      // Emit matching event
      emitter.emit("task:response", { taskId: "task-123", result: "correct" });

      const result = await promise;
      expect(result.taskId).toBe("task-123");
      expect(result.result).toBe("correct");
    });

    it("should timeout if no matching event arrives", async () => {
      const promise = waitForEvent(emitter, "filtered:event", {
        timeout: 1000,
        filter: (data: any) => data.id === 999
      });

      // Emit non-matching events
      emitter.emit("filtered:event", { id: 1 });
      emitter.emit("filtered:event", { id: 2 });
      emitter.emit("filtered:event", { id: 3 });

      // Advance past timeout
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(/Timeout/);
    });

    it("should handle complex filter logic", async () => {
      interface Response {
        requestId: string;
        status: number;
        data?: any;
      }

      const promise = waitForEvent<Response>(emitter, "response", {
        timeout: 5000,
        filter: (r) => r.requestId === "req-123" && r.status === 200 && r.data !== undefined
      });

      // Non-matching: wrong requestId
      emitter.emit("response", { requestId: "req-999", status: 200, data: "test" });

      // Non-matching: wrong status
      emitter.emit("response", { requestId: "req-123", status: 404, data: "test" });

      // Non-matching: no data
      emitter.emit("response", { requestId: "req-123", status: 200 });

      // Matching
      emitter.emit("response", { requestId: "req-123", status: 200, data: "success" });

      await expect(promise).resolves.toMatchObject({
        requestId: "req-123",
        status: 200,
        data: "success"
      });
    });
  });

  describe("cleanup", () => {
    it("should remove event listener after success", async () => {
      const promise = waitForEvent(emitter, "cleanup:test", { timeout: 5000 });

      // Check listener count before
      expect(emitter.listenerCount("cleanup:test")).toBe(1);

      // Emit event
      emitter.emit("cleanup:test", "data");
      await promise;

      // Check listener count after
      expect(emitter.listenerCount("cleanup:test")).toBe(0);
    });

    it("should remove event listener after timeout", async () => {
      const promise = waitForEvent(emitter, "cleanup:timeout", { timeout: 1000 });

      // Check listener count before
      expect(emitter.listenerCount("cleanup:timeout")).toBe(1);

      // Timeout
      vi.advanceTimersByTime(1001);

      await promise.catch(() => {}); // Ignore rejection

      // Check listener count after
      expect(emitter.listenerCount("cleanup:timeout")).toBe(0);
    });

    it("should clear timeout after success", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const promise = waitForEvent(emitter, "timeout:clear", { timeout: 5000 });

      emitter.emit("timeout:clear", "data");
      await promise;

      // clearTimeout should have been called
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should not leak listeners with filter", async () => {
      const promise = waitForEvent(emitter, "filter:cleanup", {
        timeout: 5000,
        filter: (data: any) => data.id === 5
      });

      // Emit multiple non-matching events
      emitter.emit("filter:cleanup", { id: 1 });
      emitter.emit("filter:cleanup", { id: 2 });
      emitter.emit("filter:cleanup", { id: 3 });

      // Check listener is still there
      expect(emitter.listenerCount("filter:cleanup")).toBe(1);

      // Emit matching event
      emitter.emit("filter:cleanup", { id: 5 });
      await promise;

      // Listener should be removed
      expect(emitter.listenerCount("filter:cleanup")).toBe(0);
    });

    it("should handle multiple concurrent waits and cleanup correctly", async () => {
      const promise1 = waitForEvent(emitter, "concurrent", {
        timeout: 5000,
        filter: (data: any) => data.id === 1
      });

      const promise2 = waitForEvent(emitter, "concurrent", {
        timeout: 5000,
        filter: (data: any) => data.id === 2
      });

      // Should have 2 listeners
      expect(emitter.listenerCount("concurrent")).toBe(2);

      // Resolve first
      emitter.emit("concurrent", { id: 1 });
      await promise1;

      // Should have 1 listener left
      expect(emitter.listenerCount("concurrent")).toBe(1);

      // Resolve second
      emitter.emit("concurrent", { id: 2 });
      await promise2;

      // Should have 0 listeners
      expect(emitter.listenerCount("concurrent")).toBe(0);
    });
  });
});

describe("waitForAnyEvent", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should resolve with first event that fires", async () => {
    const promise = waitForAnyEvent([
      { emitter, eventName: "event1", options: { timeout: 5000 } },
      { emitter, eventName: "event2", options: { timeout: 5000 } },
      { emitter, eventName: "event3", options: { timeout: 5000 } }
    ]);

    // Emit second event first
    emitter.emit("event2", "second");

    await expect(promise).resolves.toBe("second");
  });

  it("should reject if all events timeout", async () => {
    const promise = waitForAnyEvent([
      { emitter, eventName: "never1", options: { timeout: 1000 } },
      { emitter, eventName: "never2", options: { timeout: 1000 } }
    ]);

    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow();
  });

  it("should work with different emitters", async () => {
    const emitter1 = new EventEmitter();
    const emitter2 = new EventEmitter();

    const promise = waitForAnyEvent([
      { emitter: emitter1, eventName: "event", options: { timeout: 5000 } },
      { emitter: emitter2, eventName: "event", options: { timeout: 5000 } }
    ]);

    emitter2.emit("event", "from emitter2");

    await expect(promise).resolves.toBe("from emitter2");
  });
});

describe("waitForAllEvents", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should resolve when all events fire", async () => {
    const promise = waitForAllEvents([
      { emitter, eventName: "event1", options: { timeout: 5000 } },
      { emitter, eventName: "event2", options: { timeout: 5000 } },
      { emitter, eventName: "event3", options: { timeout: 5000 } }
    ]);

    // Emit all events
    emitter.emit("event1", "first");
    emitter.emit("event2", "second");
    emitter.emit("event3", "third");

    const results = await promise;
    expect(results).toEqual(["first", "second", "third"]);
  });

  it("should reject if any event times out", async () => {
    const promise = waitForAllEvents([
      { emitter, eventName: "event1", options: { timeout: 5000 } },
      { emitter, eventName: "never", options: { timeout: 1000 } }
    ]);

    emitter.emit("event1", "data");
    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow();
  });

  it("should work with filters on all events", async () => {
    const promise = waitForAllEvents([
      {
        emitter,
        eventName: "data",
        options: { timeout: 5000, filter: (d: any) => d.id === 1 }
      },
      {
        emitter,
        eventName: "data",
        options: { timeout: 5000, filter: (d: any) => d.id === 2 }
      }
    ]);

    // Emit in reverse order
    emitter.emit("data", { id: 2, value: "second" });
    emitter.emit("data", { id: 1, value: "first" });

    const results = await promise;
    expect(results).toEqual([{ id: 1, value: "first" }, { id: 2, value: "second" }]);
  });
});
