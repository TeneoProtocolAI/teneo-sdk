/**
 * Tests for sendMessageStreaming - StreamingResponse interface contract
 *
 * Validates the correlation-by-clientRequestId pattern: the client generates
 * a UUID client_request_id when sending; the backend echoes it back in every
 * streaming task_response. This is how we correlate chunks to the correct
 * stream (the backend-assigned task_id is unknown at send time).
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
 *
 * Events are filtered by clientRequestId (not taskId) because the backend
 * assigns task_id — the client cannot know it at send time.
 */
function createMockStreamingResponse(
  emitter: EventEmitter,
  clientRequestId: string,
  streamTimeout = 5000,
): StreamingResponse {
  const chunks: StreamingChunk[] = [];
  let done = false;
  let resolveAssembled: (s: string) => void;
  let rejectAssembled: (e: Error) => void;
  let resolveTaskId: (id: string) => void;
  let rejectTaskId: (e: Error) => void;
  let notifyChunk: (() => void) | null = null;
  let taskIdResolved = false;

  const assembledContent = new Promise<string>((resolve, reject) => {
    resolveAssembled = resolve;
    rejectAssembled = reject;
  });

  const taskIdPromise = new Promise<string>((resolve, reject) => {
    resolveTaskId = resolve;
    rejectTaskId = reject;
  });
  // Prevent unhandled rejection if consumer never awaits taskId
  taskIdPromise.catch(() => {});

  const chunkHandler = (data: any) => {
    if (data.clientRequestId !== clientRequestId) return;
    if (!taskIdResolved && data.taskId) {
      taskIdResolved = true;
      resolveTaskId!(data.taskId);
    }
    chunks.push({ content: data.content, seq: data.seq });
    notifyChunk?.();
  };

  let timer: ReturnType<typeof setTimeout>;

  const endHandler = (data: any) => {
    if (data.clientRequestId !== clientRequestId) return;
    if (!taskIdResolved && data.taskId) {
      taskIdResolved = true;
      resolveTaskId!(data.taskId);
    }
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
      if (!taskIdResolved) {
        taskIdResolved = true;
        rejectTaskId!(new Error("Stream timeout — no chunks received"));
      }
      cleanup();
      notifyChunk?.();
    }
  }, streamTimeout);

  const self: StreamingResponse = {
    clientRequestId,
    taskId: taskIdPromise,
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
    const clientRequestId = "req-1";
    const backendTaskId = "backend-task-1";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    // Emit chunks async
    setTimeout(() => {
      emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "Hello ", seq: 0 });
    }, 10);
    setTimeout(() => {
      emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "world", seq: 1 });
    }, 20);
    setTimeout(() => {
      emitter.emit("agent:stream_end", { clientRequestId, taskId: backendTaskId, assembledContent: "Hello world" });
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
    const clientRequestId = "req-2";
    const backendTaskId = "backend-task-2";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "chunk1", seq: 0 });
    emitter.emit("agent:stream_end", { clientRequestId, taskId: backendTaskId, assembledContent: "chunk1-full" });

    const result = await stream.assembledContent;
    expect(result).toBe("chunk1-full");
  });

  it("should expose clientRequestId as a string", () => {
    const clientRequestId = "req-3";
    const stream = createMockStreamingResponse(emitter, clientRequestId);
    expect(stream.clientRequestId).toBe(clientRequestId);
    expect(typeof stream.clientRequestId).toBe("string");

    // Cleanup
    emitter.emit("agent:stream_end", { clientRequestId, taskId: "t", assembledContent: "" });
  });

  it("should expose taskId as a Promise that resolves with backend-assigned id on first chunk", async () => {
    const clientRequestId = "req-4";
    const backendTaskId = "backend-assigned-task-4";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    // taskId should be a Promise
    expect(stream.taskId).toBeInstanceOf(Promise);

    // First chunk carries the backend-assigned taskId
    setTimeout(() => {
      emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "x", seq: 0 });
      emitter.emit("agent:stream_end", { clientRequestId, taskId: backendTaskId, assembledContent: "x" });
    }, 10);

    const resolvedTaskId = await stream.taskId;
    expect(resolvedTaskId).toBe(backendTaskId);

    await stream.assembledContent;
  });

  it("should ignore chunks for other clientRequestIds", async () => {
    const clientRequestId = "req-5";
    const backendTaskId = "backend-task-5";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    setTimeout(() => {
      // Chunk for a different request - should be ignored even if taskId coincidentally matches
      emitter.emit("agent:chunk", {
        clientRequestId: "other-req",
        taskId: backendTaskId,
        content: "ignore me",
        seq: 0,
      });
      emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "keep me", seq: 0 });
      emitter.emit("agent:stream_end", { clientRequestId, taskId: backendTaskId, assembledContent: "keep me" });
    }, 10);

    const received: StreamingChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe("keep me");
  });

  it("should timeout and resolve with partial content if chunks received", async () => {
    const clientRequestId = "req-6";
    const backendTaskId = "backend-task-6";
    const stream = createMockStreamingResponse(emitter, clientRequestId, 50); // 50ms timeout

    emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "partial", seq: 0 });
    // No stream_end emitted — will timeout

    const result = await stream.assembledContent;
    expect(result).toBe("partial");
  });

  it("should timeout and reject if no chunks received", async () => {
    const clientRequestId = "req-7";
    const stream = createMockStreamingResponse(emitter, clientRequestId, 50); // 50ms timeout

    // Attach catch handler immediately to prevent unhandled rejection
    const resultPromise = stream.assembledContent.catch((e: Error) => e);

    const result = await resultPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("Stream timeout");
  });

  it("should clean up event listeners after stream ends", async () => {
    const clientRequestId = "req-8";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    const listenerCountBefore = emitter.listenerCount("agent:chunk" as any);

    emitter.emit("agent:stream_end", { clientRequestId, taskId: "t", assembledContent: "done" });

    await stream.assembledContent;

    const listenerCountAfter = emitter.listenerCount("agent:chunk" as any);
    expect(listenerCountAfter).toBe(listenerCountBefore - 1);
  });

  it("should handle multiple chunks before iteration begins", async () => {
    const clientRequestId = "req-9";
    const backendTaskId = "backend-task-9";
    const stream = createMockStreamingResponse(emitter, clientRequestId);

    // Emit all chunks before consuming
    emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "a", seq: 0 });
    emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "b", seq: 1 });
    emitter.emit("agent:chunk", { clientRequestId, taskId: backendTaskId, content: "c", seq: 2 });
    emitter.emit("agent:stream_end", { clientRequestId, taskId: backendTaskId, assembledContent: "abc" });

    const received: StreamingChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toHaveLength(3);
    expect(received.map((c) => c.content).join("")).toBe("abc");
  });
});
