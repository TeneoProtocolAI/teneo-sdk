/**
 * Unit tests for AgentStatusUpdateHandler
 * Tests real-time agent status update handling and cache invalidation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentStatusUpdateHandler } from "../../../src/handlers/message-handlers/agent-status-update-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";

describe("AgentStatusUpdateHandler", () => {
  let handler: AgentStatusUpdateHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let mockAgentRoomManager: any;
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

    // Create mock agent room manager
    mockAgentRoomManager = {
      handleStatusUpdate: vi.fn()
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
      sendMessage: vi.fn(),
      agentRoomManager: mockAgentRoomManager
    } as any;

    // Create handler instance
    handler = new AgentStatusUpdateHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("agent_status_update");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "agent_status_update", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Status Update Handling", () => {
    it("should handle agent status update", async () => {
      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }
      };

      await handler.handle(message, mockContext);

      // Should invalidate cache via agent room manager
      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledWith(
        "room-123",
        "agent-456",
        "offline"
      );

      // Should emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", {
        roomId: "room-123",
        agentId: "agent-456",
        status: "offline",
        agent: undefined
      });

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "agent_status_update",
        expect.objectContaining({
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }),
        undefined
      );

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Agent status updated",
        expect.objectContaining({
          roomId: "room-123",
          agentId: "agent-456",
          status: "offline"
        })
      );
    });

    it("should handle status update with agent details", async () => {
      const agentDetails = {
        agent_id: "agent-456",
        agent_name: "Weather Agent",
        description: "Provides weather info",
        status: "online"
      };

      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "online",
          agent: agentDetails
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event with agent details
      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", {
        roomId: "room-123",
        agentId: "agent-456",
        status: "online",
        agent: agentDetails
      });
    });

    it("should handle online status", async () => {
      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-789",
          agent_id: "agent-999",
          status: "online"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledWith(
        "room-789",
        "agent-999",
        "online"
      );
    });

    it("should work without agentRoomManager in context", async () => {
      const contextWithoutManager = { ...mockContext, agentRoomManager: undefined };

      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }
      };

      await handler.handle(message, contextWithoutManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", {
        roomId: "room-123",
        agentId: "agent-456",
        status: "offline",
        agent: undefined
      });
    });

    it("should work with agentRoomManager without handleStatusUpdate method", async () => {
      const invalidManager = { someOtherMethod: vi.fn() };
      const contextWithInvalidManager = {
        ...mockContext,
        agentRoomManager: invalidManager
      };

      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }
      };

      // Should not throw
      await handler.handle(message, contextWithInvalidManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", {
        roomId: "room-123",
        agentId: "agent-456",
        status: "offline",
        agent: undefined
      });
    });
  });

  describe("Webhook Errors", () => {
    it("should handle webhook failures gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      // Should still emit event and invalidate cache
      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", expect.any(Object));
      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalled();
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "agent_status_update",
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling agent_status_update"),
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
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "online",
          extra_field: "should be ignored",
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent_room:status_update", expect.any(Object));
    });
  });

  describe("Debug Logging", () => {
    it("should log debug info", async () => {
      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "offline"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_status_update",
        expect.objectContaining({
          roomId: "room-123",
          agentId: "agent-456",
          status: "offline"
        })
      );
    });

    it("should log debug info with agent details", async () => {
      const message = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-456",
          status: "online",
          agent: {
            agent_id: "agent-456",
            agent_name: "Test Agent"
          }
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling agent_status_update",
        expect.objectContaining({
          roomId: "room-123",
          agentId: "agent-456",
          status: "online",
          hasAgent: true
        })
      );
    });
  });

  describe("Multiple Status Updates", () => {
    it("should handle multiple status updates for different agents", async () => {
      const message1 = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-1",
          status: "offline"
        }
      };

      const message2 = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-2",
          status: "online"
        }
      };

      await handler.handle(message1, mockContext);
      await handler.handle(message2, mockContext);

      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledTimes(2);
      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledWith(
        "room-123",
        "agent-1",
        "offline"
      );
      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledWith(
        "room-123",
        "agent-2",
        "online"
      );
    });

    it("should handle multiple status updates for same agent", async () => {
      const message1 = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-1",
          status: "online"
        }
      };

      const message2 = {
        type: "agent_status_update" as const,
        data: {
          room_id: "room-123",
          agent_id: "agent-1",
          status: "offline"
        }
      };

      await handler.handle(message1, mockContext);
      await handler.handle(message2, mockContext);

      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenCalledTimes(2);
      // Last call should be offline
      expect(mockAgentRoomManager.handleStatusUpdate).toHaveBeenLastCalledWith(
        "room-123",
        "agent-1",
        "offline"
      );
    });
  });
});
