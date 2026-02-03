/**
 * Unit tests for ListRoomAgentsHandler
 * Tests response handling for room agents list
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ListRoomAgentsHandler } from "../../../src/handlers/message-handlers/list-room-agents-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";

describe("ListRoomAgentsHandler", () => {
  let handler: ListRoomAgentsHandler;
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
      cacheRoomAgents: vi.fn()
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
    handler = new ListRoomAgentsHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("room_agents_response");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "room_agents_response", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Response Handling", () => {
    it("should handle room agents list with agents", async () => {
      const agents = [
        { agent_id: "agent-1", agent_name: "Agent 1", status: "online" },
        { agent_id: "agent-2", agent_name: "Agent 2", status: "offline" }
      ];

      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents
        }
      };

      await handler.handle(message, mockContext);

      // Should cache via agent room manager
      expect(mockAgentRoomManager.cacheRoomAgents).toHaveBeenCalledWith("room-123", agents);

      // Should emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-123", agents);

      // Should NOT send webhook (this is a query response)
      expect(sendWebhookSpy).not.toHaveBeenCalled();

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Room agents listed",
        expect.objectContaining({
          roomId: "room-123",
          count: 2
        })
      );
    });

    it("should handle empty agents list", async () => {
      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-456",
          agents: []
        }
      };

      await handler.handle(message, mockContext);

      // Should cache empty array
      expect(mockAgentRoomManager.cacheRoomAgents).toHaveBeenCalledWith("room-456", []);

      // Should emit event with empty array
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-456", []);

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Room agents listed",
        expect.objectContaining({
          roomId: "room-456",
          count: 0
        })
      );
    });

    it("should handle undefined agents as empty array", async () => {
      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-789"
          // agents is undefined
        }
      };

      await handler.handle(message, mockContext);

      // Should cache empty array
      expect(mockAgentRoomManager.cacheRoomAgents).toHaveBeenCalledWith("room-789", []);

      // Should emit event with empty array
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-789", []);
    });

    it("should work without agentRoomManager in context", async () => {
      const contextWithoutManager = { ...mockContext, agentRoomManager: undefined };
      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];

      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents
        }
      };

      await handler.handle(message, contextWithoutManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-123", agents);
    });

    it("should work with agentRoomManager without cacheRoomAgents method", async () => {
      const invalidManager = { someOtherMethod: vi.fn() };
      const contextWithInvalidManager = {
        ...mockContext,
        agentRoomManager: invalidManager
      };
      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];

      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents
        }
      };

      // Should not throw
      await handler.handle(message, contextWithInvalidManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-123", agents);
    });
  });

  describe("Webhook Errors", () => {
    it("should handle webhook failures gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];
      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      // Should still emit event and cache
      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-123", agents);
      expect(mockAgentRoomManager.cacheRoomAgents).toHaveBeenCalledWith("room-123", agents);
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "room_agents_response"
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log validation warning at debug level (resilience pattern)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("room_agents_response message validation warning"),
        expect.any(Object)
      );

      // Should log handler processing failure at warn level
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Handler room_agents_response failed to process message"),
        expect.any(Object)
      );
    });

    it("should accept valid message with extra fields", async () => {
      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];
      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents,
          extra_field: "should be ignored",
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent_room:agents_listed", "room-123", agents);
    });
  });

  describe("Debug Logging", () => {
    it("should log debug info", async () => {
      const agents = [
        { agent_id: "agent-1", agent_name: "Agent 1" },
        { agent_id: "agent-2", agent_name: "Agent 2" }
      ];
      const message = {
        type: "room_agents_response" as const,
        data: {
          room_id: "room-123",
          agents
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling room_agents_response",
        expect.objectContaining({
          roomId: "room-123",
          agentCount: 2
        })
      );
    });
  });
});
