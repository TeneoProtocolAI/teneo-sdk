/**
 * Unit tests for TaskResponseHandler
 * Tests non-streaming responses and streaming chunk detection/accumulation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TaskResponseHandler } from "./task-response-handler";
import { HandlerContext } from "./types";
import { Logger } from "../../types";

describe("TaskResponseHandler", () => {
  let handler: TaskResponseHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let emitSpy: ReturnType<typeof vi.fn>;
  let sendWebhookSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    emitSpy = vi.fn();
    sendWebhookSpy = vi.fn().mockResolvedValue(undefined);

    mockContext = {
      emit: emitSpy,
      sendWebhook: sendWebhookSpy,
      logger: mockLogger,
      getConnectionState: vi.fn(),
      getAuthState: vi.fn(),
      updateConnectionState: vi.fn(),
      updateAuthState: vi.fn(),
      sendMessage: vi.fn(),
    };

    handler = new TaskResponseHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("task_response");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "task_response", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Non-streaming responses", () => {
    it("should emit agent:response and NOT agent:chunk for non-streaming messages", async () => {
      const message = {
        type: "task_response" as const,
        content: "Hello world",
        content_type: "text/plain",
        from: "agent-1",
        data: {
          task_id: "task-123",
          agent_name: "Test Agent",
          success: true,
        },
      };

      await handler.handle(message, mockContext);

      // Should emit agent:response
      expect(emitSpy).toHaveBeenCalledWith(
        "agent:response",
        expect.objectContaining({
          taskId: "task-123",
          agentId: "agent-1",
          agentName: "Test Agent",
          content: "Hello world",
          success: true,
        })
      );

      // Should NOT emit agent:chunk or agent:stream_end
      const emitCalls = emitSpy.mock.calls.map((call: any[]) => call[0]);
      expect(emitCalls).not.toContain("agent:chunk");
      expect(emitCalls).not.toContain("agent:stream_end");
    });

    it("should send webhook for non-streaming messages", async () => {
      const message = {
        type: "task_response" as const,
        content: "Result",
        from: "agent-2",
        data: {
          task_id: "task-456",
          agent_name: "Agent Two",
          success: true,
        },
      };

      await handler.handle(message, mockContext);

      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "task_response",
        expect.objectContaining({
          taskId: "task-456",
          agentId: "agent-2",
        }),
        expect.objectContaining({
          agentId: "agent-2",
          taskId: "task-456",
        })
      );
    });

    it("should handle success=false in non-streaming messages", async () => {
      const message = {
        type: "task_response" as const,
        content: "Error occurred",
        from: "agent-3",
        data: {
          task_id: "task-789",
          agent_name: "Agent Three",
          success: false,
          error: "Something failed",
        },
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "agent:response",
        expect.objectContaining({
          success: false,
          error: "Something failed",
        })
      );
    });
  });

  describe("Streaming responses", () => {
    it("should emit agent:chunk but NOT agent:response for non-final streaming chunks", async () => {
      const message = {
        type: "task_response" as const,
        content: "Hello ",
        content_type: "text/plain",
        from: "agent-stream",
        data: {
          task_id: "stream-task-1",
          agent_name: "Streaming Agent",
          stream: { seq: 0, final: false },
        },
      };

      await handler.handle(message, mockContext);

      // Should emit agent:chunk
      expect(emitSpy).toHaveBeenCalledWith("agent:chunk", {
        taskId: "stream-task-1",
        clientRequestId: undefined,
        agentId: "agent-stream",
        agentName: "Streaming Agent",
        content: "Hello ",
        seq: 0,
      });

      // Should NOT emit agent:response or agent:stream_end
      const emitCalls = emitSpy.mock.calls.map((call: any[]) => call[0]);
      expect(emitCalls).not.toContain("agent:response");
      expect(emitCalls).not.toContain("agent:stream_end");
    });

    it("should NOT send webhook for non-final streaming chunks", async () => {
      const message = {
        type: "task_response" as const,
        content: "chunk1",
        from: "agent-stream",
        data: {
          task_id: "stream-task-2",
          agent_name: "Streaming Agent",
          stream: { seq: 0, final: false },
        },
      };

      await handler.handle(message, mockContext);

      expect(sendWebhookSpy).not.toHaveBeenCalled();
    });

    it("should emit agent:chunk, agent:stream_end, and agent:response on final chunk", async () => {
      // Send first chunk
      await handler.handle(
        {
          type: "task_response" as const,
          content: "Hello ",
          content_type: "text/plain",
          from: "agent-stream",
          data: {
            task_id: "stream-task-3",
            agent_name: "Streaming Agent",
            stream: { seq: 0, final: false },
          },
        },
        mockContext
      );

      emitSpy.mockClear();

      // Send final chunk
      await handler.handle(
        {
          type: "task_response" as const,
          content: "world!",
          content_type: "text/plain",
          from: "agent-stream",
          data: {
            task_id: "stream-task-3",
            agent_name: "Streaming Agent",
            stream: { seq: 1, final: true },
          },
        },
        mockContext
      );

      const emitCalls = emitSpy.mock.calls.map((call: any[]) => call[0]);

      // Should emit all three events
      expect(emitCalls).toContain("agent:chunk");
      expect(emitCalls).toContain("agent:stream_end");
      expect(emitCalls).toContain("agent:response");

      // Verify agent:chunk has correct seq
      expect(emitSpy).toHaveBeenCalledWith("agent:chunk", {
        taskId: "stream-task-3",
        clientRequestId: undefined,
        agentId: "agent-stream",
        agentName: "Streaming Agent",
        content: "world!",
        seq: 1,
      });

      // Verify agent:stream_end has assembled content
      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "stream-task-3",
        clientRequestId: undefined,
        agentId: "agent-stream",
        agentName: "Streaming Agent",
        assembledContent: "Hello world!",
      });

      // Verify agent:response has assembled content
      expect(emitSpy).toHaveBeenCalledWith(
        "agent:response",
        expect.objectContaining({
          taskId: "stream-task-3",
          agentId: "agent-stream",
          agentName: "Streaming Agent",
          content: "Hello world!",
          humanized: "Hello world!",
          success: true,
        })
      );
    });

    it("should send webhook only on final chunk with assembled content", async () => {
      // Send first chunk
      await handler.handle(
        {
          type: "task_response" as const,
          content: "Part A",
          from: "agent-stream",
          data: {
            task_id: "stream-task-4",
            agent_name: "Streaming Agent",
            stream: { seq: 0, final: false },
          },
        },
        mockContext
      );

      expect(sendWebhookSpy).not.toHaveBeenCalled();

      // Send final chunk
      await handler.handle(
        {
          type: "task_response" as const,
          content: " Part B",
          from: "agent-stream",
          data: {
            task_id: "stream-task-4",
            agent_name: "Streaming Agent",
            stream: { seq: 1, final: true },
          },
        },
        mockContext
      );

      expect(sendWebhookSpy).toHaveBeenCalledTimes(1);
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "task_response",
        expect.objectContaining({
          content: "Part A Part B",
        }),
        expect.objectContaining({
          agentId: "agent-stream",
          taskId: "stream-task-4",
        })
      );
    });

    it("should handle multiple concurrent streams independently", async () => {
      // Chunk from stream A
      await handler.handle(
        {
          type: "task_response" as const,
          content: "A1",
          from: "agent-a",
          data: {
            task_id: "task-A",
            agent_name: "Agent A",
            stream: { seq: 0, final: false },
          },
        },
        mockContext
      );

      // Chunk from stream B
      await handler.handle(
        {
          type: "task_response" as const,
          content: "B1",
          from: "agent-b",
          data: {
            task_id: "task-B",
            agent_name: "Agent B",
            stream: { seq: 0, final: false },
          },
        },
        mockContext
      );

      emitSpy.mockClear();

      // Final chunk from stream A
      await handler.handle(
        {
          type: "task_response" as const,
          content: "A2",
          from: "agent-a",
          data: {
            task_id: "task-A",
            agent_name: "Agent A",
            stream: { seq: 1, final: true },
          },
        },
        mockContext
      );

      // Stream A should have assembled "A1A2"
      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "task-A",
        clientRequestId: undefined,
        agentId: "agent-a",
        agentName: "Agent A",
        assembledContent: "A1A2",
      });

      emitSpy.mockClear();

      // Final chunk from stream B
      await handler.handle(
        {
          type: "task_response" as const,
          content: "B2",
          from: "agent-b",
          data: {
            task_id: "task-B",
            agent_name: "Agent B",
            stream: { seq: 1, final: true },
          },
        },
        mockContext
      );

      // Stream B should have assembled "B1B2"
      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "task-B",
        clientRequestId: undefined,
        agentId: "agent-b",
        agentName: "Agent B",
        assembledContent: "B1B2",
      });
    });

    it("should clean up stream buffer after final chunk", async () => {
      // Send a complete stream
      await handler.handle(
        {
          type: "task_response" as const,
          content: "only",
          from: "agent-x",
          data: {
            task_id: "task-cleanup",
            agent_name: "Agent X",
            stream: { seq: 0, final: true },
          },
        },
        mockContext
      );

      emitSpy.mockClear();

      // Send a new stream with the same taskId - should start fresh
      await handler.handle(
        {
          type: "task_response" as const,
          content: "fresh",
          from: "agent-x",
          data: {
            task_id: "task-cleanup",
            agent_name: "Agent X",
            stream: { seq: 0, final: true },
          },
        },
        mockContext
      );

      // Should assemble only "fresh", not "onlyfresh"
      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "task-cleanup",
        clientRequestId: undefined,
        agentId: "agent-x",
        agentName: "Agent X",
        assembledContent: "fresh",
      });
    });

    it("should handle empty content chunks", async () => {
      await handler.handle(
        {
          type: "task_response" as const,
          content: undefined as any,
          from: "agent-empty",
          data: {
            task_id: "task-empty",
            agent_name: "Empty Agent",
            stream: { seq: 0, final: false },
          },
        },
        mockContext
      );

      await handler.handle(
        {
          type: "task_response" as const,
          content: "data",
          from: "agent-empty",
          data: {
            task_id: "task-empty",
            agent_name: "Empty Agent",
            stream: { seq: 1, final: true },
          },
        },
        mockContext
      );

      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "task-empty",
        clientRequestId: undefined,
        agentId: "agent-empty",
        agentName: "Empty Agent",
        assembledContent: "data",
      });
    });

    it("should emit clientRequestId in chunk and stream_end events when present in message data", async () => {
      // Send first chunk with client_request_id
      await handler.handle(
        {
          type: "task_response" as const,
          content: "Hello ",
          content_type: "text/plain",
          from: "agent-stream",
          data: {
            task_id: "backend-task-id",
            agent_name: "Streaming Agent",
            client_request_id: "client-req-42",
            stream: { seq: 0, final: false },
          },
        } as any,
        mockContext
      );

      expect(emitSpy).toHaveBeenCalledWith("agent:chunk", {
        taskId: "backend-task-id",
        clientRequestId: "client-req-42",
        agentId: "agent-stream",
        agentName: "Streaming Agent",
        content: "Hello ",
        seq: 0,
      });

      emitSpy.mockClear();

      // Send final chunk
      await handler.handle(
        {
          type: "task_response" as const,
          content: "world",
          content_type: "text/plain",
          from: "agent-stream",
          data: {
            task_id: "backend-task-id",
            agent_name: "Streaming Agent",
            client_request_id: "client-req-42",
            stream: { seq: 1, final: true },
          },
        } as any,
        mockContext
      );

      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "backend-task-id",
        clientRequestId: "client-req-42",
        agentId: "agent-stream",
        agentName: "Streaming Agent",
        assembledContent: "Hello world",
      });
    });

    it("should key stream buffer by clientRequestId when present (concurrent streams with same task_id)", async () => {
      // Two concurrent streams that share the same backend task_id but have
      // different client_request_ids. This simulates a bug where task_id collides
      // across requests - the buffer must key by clientRequestId to stay isolated.
      await handler.handle(
        {
          type: "task_response" as const,
          content: "A1",
          from: "agent-a",
          data: {
            task_id: "shared-task-id",
            agent_name: "Agent A",
            client_request_id: "req-A",
            stream: { seq: 0, final: false },
          },
        } as any,
        mockContext
      );

      await handler.handle(
        {
          type: "task_response" as const,
          content: "B1",
          from: "agent-b",
          data: {
            task_id: "shared-task-id",
            agent_name: "Agent B",
            client_request_id: "req-B",
            stream: { seq: 0, final: false },
          },
        } as any,
        mockContext
      );

      emitSpy.mockClear();

      // Final chunk for req-A
      await handler.handle(
        {
          type: "task_response" as const,
          content: "A2",
          from: "agent-a",
          data: {
            task_id: "shared-task-id",
            agent_name: "Agent A",
            client_request_id: "req-A",
            stream: { seq: 1, final: true },
          },
        } as any,
        mockContext
      );

      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "shared-task-id",
        clientRequestId: "req-A",
        agentId: "agent-a",
        agentName: "Agent A",
        assembledContent: "A1A2",
      });

      emitSpy.mockClear();

      // Final chunk for req-B (separate buffer)
      await handler.handle(
        {
          type: "task_response" as const,
          content: "B2",
          from: "agent-b",
          data: {
            task_id: "shared-task-id",
            agent_name: "Agent B",
            client_request_id: "req-B",
            stream: { seq: 1, final: true },
          },
        } as any,
        mockContext
      );

      expect(emitSpy).toHaveBeenCalledWith("agent:stream_end", {
        taskId: "shared-task-id",
        clientRequestId: "req-B",
        agentId: "agent-b",
        agentName: "Agent B",
        assembledContent: "B1B2",
      });
    });
  });

  describe("Debug Logging", () => {
    it("should log streaming flag for streaming messages", async () => {
      const message = {
        type: "task_response" as const,
        content: "chunk",
        from: "agent-log",
        data: {
          task_id: "task-log",
          agent_name: "Log Agent",
          stream: { seq: 0, final: false },
        },
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling task_response message",
        expect.objectContaining({
          streaming: true,
        })
      );
    });

    it("should log streaming=false for non-streaming messages", async () => {
      const message = {
        type: "task_response" as const,
        content: "normal",
        from: "agent-log",
        data: {
          task_id: "task-log-2",
          agent_name: "Log Agent",
          success: true,
        },
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling task_response message",
        expect.objectContaining({
          streaming: false,
        })
      );
    });
  });
});
