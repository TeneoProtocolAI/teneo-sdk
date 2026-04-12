import { afterEach, describe, expect, it, vi } from "vitest";
import { TeneoSDK } from "./teneo-sdk";

describe("TeneoSDK streaming event forwarding", () => {
  let sdk: TeneoSDK | undefined;

  afterEach(() => {
    sdk?.destroy();
    sdk = undefined;
  });

  it("re-emits agent:chunk and agent:stream_end from MessageRouter", () => {
    sdk = new TeneoSDK({
      wsUrl: "ws://localhost:8080/ws",
      logLevel: "silent",
    });

    const onChunk = vi.fn();
    const onStreamEnd = vi.fn();

    sdk.on("agent:chunk", onChunk);
    sdk.on("agent:stream_end", onStreamEnd);

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

    ((sdk as any).messages).emit("agent:chunk", chunkPayload);
    ((sdk as any).messages).emit("agent:stream_end", endPayload);

    expect(onChunk).toHaveBeenCalledWith(chunkPayload);
    expect(onStreamEnd).toHaveBeenCalledWith(endPayload);
  });
});
