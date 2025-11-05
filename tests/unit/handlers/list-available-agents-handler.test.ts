/**
 * Unit tests for ListAvailableAgentsHandler
 * Tests response handling for available agents list
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ListAvailableAgentsHandler } from "../../../src/handlers/message-handlers/list-available-agents-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";

describe("ListAvailableAgentsHandler", () => {
  let handler: ListAvailableAgentsHandler;
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
    handler = new ListAvailableAgentsHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("available_agents_response");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "available_agents_response", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Response Handling", () => {
    it("should handle available agents list with agents", async () => {
      const agents = [
        { agent_id: "agent-3", agent_name: "Agent 3", status: "online" },
        { agent_id: "agent-4", agent_name: "Agent 4", status: "online" }
      ];

      const message = {
        type: "available_agents_response" as const,
        data: {
          agents
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", agents);

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "available_agents_listed",
        expect.objectContaining({
          agents
        }),
        undefined
      );

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Available agents listed",
        expect.objectContaining({
          count: 2
        })
      );
    });

    it("should handle empty agents list", async () => {
      const message = {
        type: "available_agents_response" as const,
        data: {
          agents: []
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event with empty array
      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", []);

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Available agents listed",
        expect.objectContaining({
          count: 0
        })
      );
    });

    it("should handle undefined agents as empty array", async () => {
      const message = {
        type: "available_agents_response" as const,
        data: {
          // agents is undefined
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event with empty array
      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", []);
    });

    it("should handle agents with full details", async () => {
      const agents = [
        {
          agent_id: "agent-1",
          agent_name: "Weather Agent",
          description: "Provides weather information",
          capabilities: [
            { name: "weather-forecast", description: "Get weather forecasts" }
          ],
          commands: [
            { trigger: "weather", description: "Check weather" }
          ],
          image: "https://example.com/agent.png",
          status: "online"
        }
      ];

      const message = {
        type: "available_agents_response" as const,
        data: {
          agents
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event with full agent details
      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", agents);
    });
  });

  describe("Webhook Errors", () => {
    it("should handle webhook failures gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];
      const message = {
        type: "available_agents_response" as const,
        data: {
          agents
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", agents);
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "available_agents_response",
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling available_agents_response"),
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
      const agents = [{ agent_id: "agent-1", agent_name: "Agent 1" }];
      const message = {
        type: "available_agents_response" as const,
        data: {
          agents,
          extra_field: "should be ignored",
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("agent_room:available_agents_listed", agents);
    });
  });

  describe("Debug Logging", () => {
    it("should log debug info", async () => {
      const agents = [
        { agent_id: "agent-1", agent_name: "Agent 1" },
        { agent_id: "agent-2", agent_name: "Agent 2" }
      ];
      const message = {
        type: "available_agents_response" as const,
        data: {
          agents
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling available_agents_response",
        expect.objectContaining({
          agentCount: 2
        })
      );
    });
  });
});
