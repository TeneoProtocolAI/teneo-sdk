import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { WebSocketClient } from "../core/websocket-client";
import { MessageRouter } from "./message-router";

describe("MessageRouter streaming event forwarding", () => {
  it("re-emits agent:chunk and agent:stream_end from WebSocketClient", () => {
    const wsClient = new EventEmitter() as unknown as WebSocketClient;
    const webhookHandler = {
      sendMessageWebhook: vi.fn().mockResolvedValue(undefined),
      sendWebhook: vi.fn().mockResolvedValue(undefined),
    } as any;
    const responseFormatter = { formatTaskResponse: vi.fn() } as any;
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const router = new MessageRouter(
      wsClient,
      webhookHandler,
      responseFormatter,
      logger,
      {},
    );

    const onChunk = vi.fn();
    const onStreamEnd = vi.fn();

    router.on("agent:chunk", onChunk);
    router.on("agent:stream_end", onStreamEnd);

    const chunkPayload = {
      taskId: "task-1",
      clientRequestId: "req-1",
      agentId: "agent-1",
      agentName: "Agent One",
      content: "hello",
      seq: 0,
    };

    const endPayload = {
      taskId: "task-1",
      clientRequestId: "req-1",
      agentId: "agent-1",
      agentName: "Agent One",
      assembledContent: "hello world",
    };

    (wsClient as any).emit("agent:chunk", chunkPayload);
    (wsClient as any).emit("agent:stream_end", endPayload);

    expect(onChunk).toHaveBeenCalledWith(chunkPayload);
    expect(onStreamEnd).toHaveBeenCalledWith(endPayload);

    router.destroy();
  });
});
