/**
 * Unit tests for ApiExecuteResponseHandler.
 *
 * Verifies that a well-formed api_execute_response message is validated and
 * re-emitted as an agent:response event — the same event the rest of the
 * SDK (including MessageRouter.executeCommand's waitForEvent filter) listens
 * on. This keeps consumers agnostic of which server codepath produced the
 * reply (chat-style task_response vs roomless api_execute_response).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiExecuteResponseHandler } from "./api-execute-response-handler";
import { HandlerContext } from "./types";
import { Logger } from "../../types";

describe("ApiExecuteResponseHandler", () => {
  let handler: ApiExecuteResponseHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let emitSpy: ReturnType<typeof vi.fn>;
  let sendWebhookSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
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
      sendMessage: vi.fn()
    };
    handler = new ApiExecuteResponseHandler();
  });

  describe("handler metadata", () => {
    it("binds to api_execute_response", () => {
      expect(handler.type).toBe("api_execute_response");
      expect(handler.canHandle({ type: "api_execute_response", data: {} } as any)).toBe(true);
      expect(handler.canHandle({ type: "task_response", data: {} } as any)).toBe(false);
    });
  });

  describe("agent:response emission", () => {
    it("emits agent:response with fields derived from the message", async () => {
      const message = {
        type: "api_execute_response" as const,
        content: "Forecast: sunny",
        content_type: "text/plain" as const,
        from: "weather-agent",
        request_id: "corr-abc",
        data: {
          task_id: "task-123",
          agent_id: "weather-agent",
          agent_name: "Weather Agent",
          client_request_id: "corr-abc"
        }
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "agent:response",
        expect.objectContaining({
          taskId: "task-123",
          agentId: "weather-agent",
          agentName: "Weather Agent",
          content: "Forecast: sunny",
          success: true
        })
      );
    });

    it("preserves data.client_request_id on raw — executeCommand relies on it", async () => {
      const message = {
        type: "api_execute_response" as const,
        content: "ok",
        from: "agent-1",
        data: { task_id: "task-xyz", client_request_id: "corr-xyz" }
      };

      await handler.handle(message, mockContext);

      const [, response] = emitSpy.mock.calls.find(([e]) => e === "agent:response") ?? [];
      const echoedCorrelationId = (response as any).raw?.data?.client_request_id;
      expect(echoedCorrelationId).toBe("corr-xyz");
    });

    it("falls back to from for agentId when data.agent_id is missing", async () => {
      const message = {
        type: "api_execute_response" as const,
        content: "ok",
        from: "fallback-agent",
        data: { task_id: "t-1" }
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "agent:response",
        expect.objectContaining({ agentId: "fallback-agent" })
      );
    });

    it("dispatches a task_response webhook (same event type as chat-style replies)", async () => {
      const message = {
        type: "api_execute_response" as const,
        content: "ok",
        from: "agent-1",
        data: { task_id: "t-1", agent_id: "agent-1" }
      };

      await handler.handle(message, mockContext);

      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "task_response",
        expect.any(Object),
        expect.objectContaining({ agentId: "agent-1", taskId: "t-1" })
      );
    });
  });
});
