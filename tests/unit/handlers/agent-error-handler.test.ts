/**
 * Unit tests for AgentErrorHandler
 * Tests response handling for agent failure notifications
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentErrorHandler } from "../../../src/handlers/message-handlers/agent-error-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";

describe("AgentErrorHandler", () => {
  let handler: AgentErrorHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let emitSpy: ReturnType<typeof vi.fn>;
  let sendWebhookSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Create spies
    emitSpy = vi.fn();
    sendWebhookSpy = vi.fn().mockResolvedValue(undefined);

    // Create mock context
    mockContext = {
      emit: emitSpy,
      sendWebhook: sendWebhookSpy,
      logger: mockLogger,
      getConnectionState: vi.fn(),
      getAuthState: vi.fn(),
      updateConnectionState: vi.fn(),
      updateAuthState: vi.fn(),
      sendMessage: vi.fn()
    };

    // Create handler instance
    handler = new AgentErrorHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("agent_error");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "agent_error", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Response Handling", () => {
    it("should handle message with all fields", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Agent failed to process request",
        from: "weather-agent",
        data: {
          task_id: "task-123",
          client_request_id: "req-456"
        },
        room: "room-789"
      };

      await handler.handle(message, mockContext);

      // Should emit event with correct shape
      expect(emitSpy).toHaveBeenCalledWith("agent:error", {
        agentName: "weather-agent",
        content: "Agent failed to process request",
        taskId: "task-123",
        clientRequestId: "req-456",
        room: "room-789"
      });

      // Should send webhook with correct data
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "agent_error",
        expect.objectContaining({
          agentName: "weather-agent",
          content: "Agent failed to process request",
          taskId: "task-123",
          clientRequestId: "req-456",
          room: "room-789"
        }),
        undefined
      );
    });

    it("should handle message with minimal fields", async () => {
      const message = {
        type: "agent_error" as const
      };

      await handler.handle(message, mockContext);

      // Should emit event with undefined optional fields
      expect(emitSpy).toHaveBeenCalledWith("agent:error", {
        agentName: undefined,
        content: undefined,
        taskId: undefined,
        clientRequestId: undefined,
        room: undefined
      });
    });

    it("should handle missing optional data fields", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Something went wrong",
        from: "search-agent"
      };

      await handler.handle(message, mockContext);

      // Should emit event with undefined data-derived fields
      expect(emitSpy).toHaveBeenCalledWith("agent:error", {
        agentName: "search-agent",
        content: "Something went wrong",
        taskId: undefined,
        clientRequestId: undefined,
        room: undefined
      });
    });

    it("should handle message with data but no task_id or client_request_id", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Timeout error",
        from: "code-agent",
        data: {},
        room: "room-abc"
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent:error", {
        agentName: "code-agent",
        content: "Timeout error",
        taskId: undefined,
        clientRequestId: undefined,
        room: "room-abc"
      });
    });
  });

  describe("Event Emission", () => {
    it("should emit agent:error with correct shape", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Internal agent failure",
        from: "translate-agent",
        data: {
          task_id: "task-abc",
          client_request_id: "req-def"
        },
        room: "room-ghi"
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith("agent:error", {
        agentName: "translate-agent",
        content: "Internal agent failure",
        taskId: "task-abc",
        clientRequestId: "req-def",
        room: "room-ghi"
      });
    });

    it("should emit event before webhook is sent", async () => {
      const callOrder: string[] = [];
      emitSpy.mockImplementation(() => callOrder.push("emit"));
      sendWebhookSpy.mockImplementation(() => {
        callOrder.push("webhook");
        return Promise.resolve(undefined);
      });

      const message = {
        type: "agent_error" as const,
        content: "Error",
        from: "agent-x"
      };

      await handler.handle(message, mockContext);

      expect(callOrder[0]).toBe("emit");
    });
  });

  describe("Webhook", () => {
    it("should send webhook with correct data", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Agent crashed",
        from: "math-agent",
        data: {
          task_id: "task-w1",
          client_request_id: "req-w2"
        },
        room: "room-w3"
      };

      await handler.handle(message, mockContext);

      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "agent_error",
        {
          agentName: "math-agent",
          content: "Agent crashed",
          taskId: "task-w1",
          clientRequestId: "req-w2",
          room: "room-w3"
        },
        undefined
      );
    });

    it("should handle webhook failure gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const message = {
        type: "agent_error" as const,
        content: "Agent error occurred",
        from: "data-agent",
        data: {
          task_id: "task-fail"
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith(
        "agent:error",
        expect.objectContaining({
          agentName: "data-agent",
          content: "Agent error occurred",
          taskId: "task-fail"
        })
      );
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "agent_error",
        data: {
          task_id: 12345 // Should be string
        }
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling agent_error"),
        expect.any(Error)
      );

      // Should emit message:error event
      expect(emitSpy).toHaveBeenCalledWith("message:error", expect.any(Error), invalidMessage);
    });

    it("should accept valid message with extra fields (passthrough)", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Error with extras",
        from: "extra-agent",
        data: {
          task_id: "task-extra",
          client_request_id: "req-extra",
          some_extra_field: "should be ignored"
        },
        room: "room-extra",
        unknown_field: "also ignored"
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "agent:error",
        expect.objectContaining({
          agentName: "extra-agent",
          content: "Error with extras"
        })
      );
    });
  });

  describe("Debug Logging", () => {
    it("should log at debug level", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Debug test error",
        from: "debug-agent",
        data: {
          task_id: "task-dbg"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_error",
        expect.objectContaining({
          from: "debug-agent",
          taskId: "task-dbg",
          content: "Debug test error"
        })
      );
    });

    it("should log at warn level", async () => {
      const message = {
        type: "agent_error" as const,
        content: "Warn test error",
        from: "warn-agent",
        data: {
          task_id: "task-wrn"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Agent error received",
        expect.objectContaining({
          agentName: "warn-agent",
          content: "Warn test error",
          taskId: "task-wrn"
        })
      );
    });

    it("should log with undefined fields when data is missing", async () => {
      const message = {
        type: "agent_error" as const
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_error",
        expect.objectContaining({
          from: undefined,
          taskId: undefined,
          content: undefined
        })
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Agent error received",
        expect.objectContaining({
          agentName: undefined,
          content: undefined,
          taskId: undefined
        })
      );
    });
  });
});
