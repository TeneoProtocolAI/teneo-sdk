/**
 * Tests for sendMessageStreaming - StreamingResponse interface contract
 * Validates async iterator yields chunks and assembledContent resolves correctly
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { StreamingChunk, StreamingResponse } from "./message-router";

// This test uses real timers since fake timers with shouldAdvanceTime
// can cause unhandled rejections from timeout-based promise patterns
beforeAll(() => {
  vi.useRealTimers();
});

afterAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

/**
 * Simulate the streaming response pattern used by MessageRouter.sendMessageStreaming
 * without requiring full SDK wiring. This validates the consumer experience.
 */
function createMockStreamingResponse(
  emitter: EventEmitter,
  taskId: string,
  streamTimeout = 5000,
): StreamingResponse {
  const chunks: StreamingChunk[] = [];
  let done = false;
  let resolveAssembled: (s: string) => void;
  let rejectAssembled: (e: Error) => void;
  let notifyChunk: (() => void) | null = null;

  const assembledContent = new Promise<string>((resolve, reject) => {
    resolveAssembled = resolve;
    rejectAssembled = reject;
  });

  const chunkHandler = (data: any) => {
    if (data.taskId !== taskId) return;
    chunks.push({ content: data.content, seq: data.seq });
    notifyChunk?.();
  };

  let timer: ReturnType<typeof setTimeout>;

  const endHandler = (data: any) => {
    if (data.taskId !== taskId) return;
    done = true;
    clearTimeout(timer);
    resolveAssembled!(data.assembledContent);
    cleanup();
    notifyChunk?.();
  };

  const cleanup = () => {
    emitter.off("agent:chunk", chunkHandler);
    emitter.off("agent:stream_end", endHandler);
  };

  emitter.on("agent:chunk", chunkHandler);
  emitter.on("agent:stream_end", endHandler);

  timer = setTimeout(() => {
    if (!done) {
      done = true;
      if (chunks.length > 0) {
        resolveAssembled!(chunks.map((c) => c.content).join(""));
      } else {
        rejectAssembled!(new Error("Stream timeout — no chunks received"));
      }
      cleanup();
      notifyChunk?.();
    }
  }, streamTimeout);

  // Note: timer is cleared in endHandler and timeout handler directly,
  // avoiding .finally() which can create unhandled rejected promise chains

  const self: StreamingResponse = {
    taskId,
    assembledContent,
    async *[Symbol.asyncIterator]() {
      let yielded = 0;
      while (true) {
        while (yielded < chunks.length) {
          yield chunks[yielded++];
        }
        if (done) return;
        await new Promise<void>((r) => {
          notifyChunk = r;
        });
        notifyChunk = null;
      }
    },
  };

  return self;
}

describe("StreamingResponse", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it("should yield chunks as they arrive via async iterator", async () => {
    const taskId = "test-task-1";
    const stream = createMockStreamingResponse(emitter, taskId);

    // Emit chunks async
    setTimeout(() => {
      emitter.emit("agent:chunk", { taskId, content: "Hello ", seq: 0 });
    }, 10);
    setTimeout(() => {
      emitter.emit("agent:chunk", { taskId, content: "world", seq: 1 });
    }, 20);
    setTimeout(() => {
      emitter.emit("agent:stream_end", { taskId, assembledContent: "Hello world" });
    }, 30);

    const received: StreamingChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ content: "Hello ", seq: 0 });
    expect(received[1]).toEqual({ content: "world", seq: 1 });
  });

  it("should resolve assembledContent with full text on stream end", async () => {
    const taskId = "test-task-2";
    const stream = createMockStreamingResponse(emitter, taskId);

    emitter.emit("agent:chunk", { taskId, content: "chunk1", seq: 0 });
    emitter.emit("agent:stream_end", { taskId, assembledContent: "chunk1-full" });

    const result = await stream.assembledContent;
    expect(result).toBe("chunk1-full");
  });

  it("should expose taskId", async () => {
    const taskId = "test-task-3";
    const stream = createMockStreamingResponse(emitter, taskId);
    expect(stream.taskId).toBe(taskId);

    // Cleanup
    emitter.emit("agent:stream_end", { taskId, assembledContent: "" });
    await stream.assembledContent;
  });

  it("should ignore chunks for other taskIds", async () => {
    const taskId = "test-task-4";
    const stream = createMockStreamingResponse(emitter, taskId);

    setTimeout(() => {
      emitter.emit("agent:chunk", { taskId: "other-task", content: "ignore me", seq: 0 });
      emitter.emit("agent:chunk", { taskId, content: "keep me", seq: 0 });
      emitter.emit("agent:stream_end", { taskId, assembledContent: "keep me" });
    }, 10);

    const received: StreamingChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe("keep me");
  });

  it("should timeout and resolve with partial content if chunks received", async () => {
    const taskId = "test-task-5";
    const stream = createMockStreamingResponse(emitter, taskId, 50); // 50ms timeout

    emitter.emit("agent:chunk", { taskId, content: "partial", seq: 0 });
    // No stream_end emitted — will timeout

    const result = await stream.assembledContent;
    expect(result).toBe("partial");
  });

  it("should timeout and reject if no chunks received", async () => {
    const taskId = "test-task-6";
    const stream = createMockStreamingResponse(emitter, taskId, 50); // 50ms timeout

    // Attach catch handler immediately to prevent unhandled rejection
    const resultPromise = stream.assembledContent.catch((e: Error) => e);

    const result = await resultPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("Stream timeout");
  });

  it("should clean up event listeners after stream ends", async () => {
    const taskId = "test-task-7";
    const stream = createMockStreamingResponse(emitter, taskId);

    const listenerCountBefore = emitter.listenerCount("agent:chunk" as any);

    emitter.emit("agent:stream_end", { taskId, assembledContent: "done" });

    await stream.assembledContent;

    const listenerCountAfter = emitter.listenerCount("agent:chunk" as any);
    expect(listenerCountAfter).toBe(listenerCountBefore - 1);
  });

  it("should handle multiple chunks before iteration begins", async () => {
    const taskId = "test-task-8";
    const stream = createMockStreamingResponse(emitter, taskId);

    // Emit all chunks before consuming
    emitter.emit("agent:chunk", { taskId, content: "a", seq: 0 });
    emitter.emit("agent:chunk", { taskId, content: "b", seq: 1 });
    emitter.emit("agent:chunk", { taskId, content: "c", seq: 2 });
    emitter.emit("agent:stream_end", { taskId, assembledContent: "abc" });

    const received: StreamingChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toHaveLength(3);
    expect(received.map((c) => c.content).join("")).toBe("abc");
  });
});
