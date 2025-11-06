/**
 * Unit tests for AgentRoomOperationResponseHandler
 * Tests response handling for agent-room add/remove operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRoomOperationResponseHandler } from "../../../src/handlers/message-handlers/agent-room-operation-response-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";
import { SDKError } from "../../../src/types/events";
import { ErrorCode } from "../../../src/types/error-codes";

describe("AgentRoomOperationResponseHandler", () => {
  let handler: AgentRoomOperationResponseHandler;
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
    handler = new AgentRoomOperationResponseHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("agent_room_operation_response");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "agent_room_operation_response", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Success Responses", () => {
    it("should handle successful agent add", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123",
          agent_id: "agent-456"
        }
      };

      await handler.handle(message, mockContext);

      // Should emit both add and remove events (listeners filter by room/agent ID)
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_added", "room-123", "agent-456");
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_removed", "room-123", "agent-456");

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "agent_room_operation",
        expect.objectContaining({
          success: true,
          room_id: "room-123",
          agent_id: "agent-456"
        }),
        undefined
      );

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Agent room operation succeeded",
        expect.objectContaining({
          roomId: "room-123",
          agentId: "agent-456"
        })
      );
    });

    it("should handle successful agent remove", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-789",
          agent_id: "agent-999"
        }
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_added", "room-789", "agent-999");
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_removed", "room-789", "agent-999");
    });

    it("should handle success without agent_id", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123"
        }
      };

      await handler.handle(message, mockContext);

      // Should log warning and not emit success events
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Agent room operation succeeded but missing room_id or agent_id"
      );
      expect(emitSpy).not.toHaveBeenCalledWith("agent_room:agent_added", expect.anything(), expect.anything());
    });

    it("should handle success without room_id", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          agent_id: "agent-456"
        }
      };

      await handler.handle(message, mockContext);

      // Should log warning and not emit success events
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Agent room operation succeeded but missing room_id or agent_id"
      );
      expect(emitSpy).not.toHaveBeenCalledWith("agent_room:agent_added", expect.anything(), expect.anything());
    });
  });

  describe("Error Responses", () => {
    it("should handle error response with message", async () => {
      const errorMessage = "Agent already in room";
      const roomId = "room-123";
      const agentId = "agent-456";

      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: false,
          message: errorMessage,
          room_id: roomId,
          agent_id: agentId
        }
      };

      await handler.handle(message, mockContext);

      // Should emit both add and remove error events
      expect(emitSpy).toHaveBeenCalledWith(
        "agent_room:add_error",
        expect.any(SDKError),
        roomId
      );
      expect(emitSpy).toHaveBeenCalledWith(
        "agent_room:remove_error",
        expect.any(SDKError),
        roomId
      );

      // Verify error details
      const addErrorCall = emitSpy.mock.calls.find(
        (call) => call[0] === "agent_room:add_error"
      );
      const error = addErrorCall[1] as SDKError;
      expect(error.message).toBe(errorMessage);
      expect(error.code).toBe(ErrorCode.OPERATION_FAILED);

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "agent_room_operation_error",
        expect.objectContaining({
          success: false,
          message: errorMessage,
          room_id: roomId,
          agent_id: agentId
        }),
        undefined
      );

      // Should log
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Agent room operation failed",
        expect.objectContaining({
          roomId,
          agentId,
          error: errorMessage
        })
      );
    });

    it("should handle error without message", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: false,
          room_id: "room-123"
        }
      };

      await handler.handle(message, mockContext);

      // Should use default error message
      const addErrorCall = emitSpy.mock.calls.find(
        (call) => call[0] === "agent_room:add_error"
      );
      const error = addErrorCall[1] as SDKError;
      expect(error.message).toBe("Agent room operation failed");
    });

    it("should handle error without room_id", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: false,
          message: "Generic error",
          agent_id: "agent-456"
        }
      };

      await handler.handle(message, mockContext);

      // Should emit error events with undefined room_id
      expect(emitSpy).toHaveBeenCalledWith(
        "agent_room:add_error",
        expect.any(SDKError),
        undefined
      );
      expect(emitSpy).toHaveBeenCalledWith(
        "agent_room:remove_error",
        expect.any(SDKError),
        undefined
      );
    });

    it("should handle error without agent_id", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: false,
          message: "Room not found",
          room_id: "room-123"
        }
      };

      await handler.handle(message, mockContext);

      // Should still emit error events
      expect(emitSpy).toHaveBeenCalledWith(
        "agent_room:add_error",
        expect.any(SDKError),
        "room-123"
      );
    });
  });

  describe("Webhook Errors", () => {
    it("should handle webhook failures gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123",
          agent_id: "agent-456"
        }
      };

      // Should not throw (webhook errors are logged but don't fail the handler)
      await handler.handle(message, mockContext);

      // Should still emit events
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_added", "room-123", "agent-456");
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "agent_room_operation_response",
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling agent_room_operation_response"),
        expect.any(Error)
      );

      // Should emit message:error event
      expect(emitSpy).toHaveBeenCalledWith(
        "message:error",
        expect.any(Error),
        invalidMessage
      );
    });

    it("should accept valid message with extra fields", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123",
          agent_id: "agent-456",
          extra_field: "should be ignored",
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent_room:agent_added", "room-123", "agent-456");
    });
  });

  describe("Debug Logging", () => {
    it("should log debug info for successful operation", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123",
          agent_id: "agent-456"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_room_operation_response",
        expect.objectContaining({
          success: true,
          roomId: "room-123",
          agentId: "agent-456"
        })
      );
    });

    it("should log debug info for error operation", async () => {
      const message = {
        type: "agent_room_operation_response" as const,
        data: {
          success: false,
          message: "Error occurred",
          room_id: "room-123"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_room_operation_response",
        expect.objectContaining({
          success: false,
          roomId: "room-123"
        })
      );
    });
  });
});
