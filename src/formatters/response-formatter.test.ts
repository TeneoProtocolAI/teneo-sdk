import { describe, it, expect, beforeEach } from "vitest";
import { ResponseFormatter } from "./response-formatter";
import type {
  TaskResponseMessage,
  AgentSelectedMessage,
  ErrorMessage,
  Agent,
  BaseMessage
} from "../types";

describe("ResponseFormatter", () => {
  let formatter: ResponseFormatter;

  beforeEach(() => {
    formatter = new ResponseFormatter({ format: "humanized", includeMetadata: false });
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      expect(formatter).toBeDefined();
    });

    it("should initialize with different format options", () => {
      const rawFormatter = new ResponseFormatter({ format: "raw", includeMetadata: false });
      const bothFormatter = new ResponseFormatter({ format: "both", includeMetadata: true });

      expect(rawFormatter).toBeDefined();
      expect(bothFormatter).toBeDefined();
    });

    it("should validate format option", () => {
      expect(() => new ResponseFormatter({ format: "invalid" as any })).toThrow();
    });
  });

  describe("formatTaskResponse", () => {
    const taskResponse: TaskResponseMessage = {
      type: "task_response",
      content: "Task completed successfully",
      from: "agent-1",
      data: {
        agent_name: "Test Agent",
        task_id: "task-123",
        success: true
      },
      content_type: "text/plain",
      reasoning: "Task was straightforward",
      timestamp: new Date().toISOString()
    };

    describe("with humanized format", () => {
      it("should format task response to humanized text", () => {
        const result = formatter.formatTaskResponse(taskResponse);

        expect(result.humanized).toBeDefined();
        expect(result.humanized).toContain("[RESPONSE] From Test Agent");
        expect(result.humanized).toContain("Task completed successfully");
        expect(result.humanized).toContain("[REASONING] Task was straightforward");
        expect(result.raw).toBeUndefined();
      });

      it("should handle error in task response", () => {
        const errorResponse: TaskResponseMessage = {
          ...taskResponse,
          data: {
            ...taskResponse.data,
            success: false,
            error: "Task failed due to error"
          }
        };

        const result = formatter.formatTaskResponse(errorResponse);
        expect(result.humanized).toContain("[ERROR] Task failed due to error");
      });

      it("should handle JSON content type", () => {
        const jsonResponse: TaskResponseMessage = {
          ...taskResponse,
          content: JSON.stringify({ message: "Hello", data: [1, 2, 3] }),
          content_type: "application/json"
        };

        const result = formatter.formatTaskResponse(jsonResponse);
        expect(result.humanized).toContain("message: Hello");
        expect(result.humanized).toContain("data:");
      });

      it("should handle markdown content type", () => {
        const mdResponse: TaskResponseMessage = {
          ...taskResponse,
          content: "# Heading\n\n**Bold text**",
          content_type: "text/markdown"
        };

        const result = formatter.formatTaskResponse(mdResponse);
        expect(result.humanized).toContain("# Heading");
        expect(result.humanized).toContain("**Bold text**");
      });

      it("should handle array content type", () => {
        const arrayResponse: TaskResponseMessage = {
          ...taskResponse,
          content: JSON.stringify(["item1", "item2", "item3"]),
          content_type: "ARRAY"
        };

        const result = formatter.formatTaskResponse(arrayResponse);
        expect(result.humanized).toContain("[0]: item1");
        expect(result.humanized).toContain("[1]: item2");
        expect(result.humanized).toContain("[2]: item3");
      });
    });

    describe("with raw format", () => {
      beforeEach(() => {
        formatter = new ResponseFormatter({ format: "raw", includeMetadata: false });
      });

      it("should return raw task response", () => {
        const result = formatter.formatTaskResponse(taskResponse);

        expect(result.raw).toEqual(taskResponse);
        expect(result.humanized).toBeUndefined();
      });
    });

    describe("with both format", () => {
      beforeEach(() => {
        formatter = new ResponseFormatter({ format: "both", includeMetadata: false });
      });

      it("should return both raw and humanized formats", () => {
        const result = formatter.formatTaskResponse(taskResponse);

        expect(result.raw).toEqual(taskResponse);
        expect(result.humanized).toBeDefined();
        expect(result.humanized).toContain("[RESPONSE] From Test Agent");
      });
    });

    describe("with metadata", () => {
      beforeEach(() => {
        formatter = new ResponseFormatter({ format: "both", includeMetadata: true });
      });

      it("should include metadata in response", () => {
        const result = formatter.formatTaskResponse(taskResponse);

        expect(result.metadata).toBeDefined();
        expect(result.metadata?.messageType).toBe("task_response");
        expect(result.metadata?.agentId).toBe("agent-1");
        expect(result.metadata?.agentName).toBe("Test Agent");
        expect(result.metadata?.taskId).toBe("task-123");
        expect(result.metadata?.success).toBe(true);
        expect(result.metadata?.reasoning).toBe("Task was straightforward");
      });
    });
  });

  describe("formatAgentSelected", () => {
    const agentSelected: AgentSelectedMessage = {
      type: "agent_selected",
      content: "Agent selected",
      from: "coordinator",
      data: {
        agent_id: "agent-1",
        agent_name: "Test Agent",
        user_request: "Help me with a task",
        capabilities: [
          { name: "chat", description: "Chat with users" },
          { name: "code", description: "Write code" }
        ],
        command: "execute",
        command_reasoning: "Best agent for the task"
      },
      reasoning: "Selected based on capabilities",
      timestamp: new Date().toISOString()
    };

    it("should format agent selected message in humanized format", () => {
      const result = formatter.formatAgentSelected(agentSelected);

      expect(result.humanized).toContain("[AGENT] Coordinator selected Test Agent");
      expect(result.humanized).toContain("[COMMAND] execute");
      expect(result.humanized).toContain("[REASONING] Selected based on capabilities");
      expect(result.humanized).toContain("[CAPABILITIES]");
      expect(result.humanized).toContain("- chat: Chat with users");
      expect(result.humanized).toContain("- code: Write code");
    });

    it("should handle missing optional fields in data", () => {
      const minimal: AgentSelectedMessage = {
        type: "agent_selected",
        content: "Selected",
        from: "coordinator",
        reasoning: "Selected by coordinator",
        data: {
          agent_id: "agent-1",
          agent_name: "Agent",
          user_request: "Request"
        }
      };

      const result = formatter.formatAgentSelected(minimal);
      expect(result.humanized).toContain("[AGENT] Coordinator selected Agent");
      expect(result.humanized).not.toContain("[COMMAND]");
      expect(result.humanized).not.toContain("[CAPABILITIES]");
    });
  });

  describe("formatError", () => {
    const errorMessage: ErrorMessage = {
      type: "error",
      content: "An error occurred",
      from: "system",
      data: {
        message: "Connection failed",
        code: 500,
        details: { reason: "timeout", attempts: 3 }
      },
      timestamp: new Date().toISOString()
    };

    it("should format error message in humanized format", () => {
      const result = formatter.formatError(errorMessage);

      expect(result.humanized).toContain("[ERROR] An error occurred");
      expect(result.humanized).toContain("(Code: 500)");
      expect(result.humanized).toContain("Details:");
      expect(result.humanized).toContain('"reason": "timeout"');
      expect(result.humanized).toContain('"attempts": 3');
    });

    it("should handle minimal error", () => {
      const minimal: ErrorMessage = {
        type: "error",
        content: "Simple error",
        from: "system",
        data: {
          message: "Simple error",
          code: 1
        }
      };

      const result = formatter.formatError(minimal);
      expect(result.humanized).toBe("[ERROR] Simple error (Code: 1)");
    });
  });

  describe("formatAgentList", () => {
    const agents: Agent[] = [
      {
        id: "agent-1",
        name: "Agent One",
        description: "First agent",
        status: "online",
        room: "room-1",
        capabilities: [{ name: "chat", description: "Chat capability" }],
        commands: [{ trigger: "/help", description: "Show help", argument: "[topic]" }]
      },
      {
        id: "agent-2",
        name: "Agent Two",
        description: "Second agent",
        room: "room-2",
        status: "offline"
      }
    ];

    it("should format agent list in humanized format", () => {
      const result = formatter.formatAgentList(agents);

      expect(result.humanized).toContain("[AGENTS] Available Agents (2):");
      expect(result.humanized).toContain("[AGENT] Agent One [ONLINE]");
      expect(result.humanized).toContain("First agent");
      expect(result.humanized).toContain("Room: room-1");
      expect(result.humanized).toContain("Capabilities:");
      expect(result.humanized).toContain("- chat");
      expect(result.humanized).toContain("Commands:");
      expect(result.humanized).toContain("- /help [topic]");
      expect(result.humanized).toContain("[AGENT] Agent Two [OFFLINE]");
      expect(result.humanized).toContain("Second agent");
    });

    it("should handle empty agent list", () => {
      const result = formatter.formatAgentList([]);
      expect(result.humanized).toBe("[AGENTS] No agents available");
    });
  });

  describe("format (generic)", () => {
    it("should format message type", () => {
      const message: BaseMessage = {
        type: "message",
        content: "Hello world",
        from: "user-1",
        room: "general"
      };

      const result = formatter.format(message);
      expect(result.humanized).toBe("[general] [MESSAGE] user-1: Hello world");
    });

    it("should handle unknown message types", () => {
      const unknown: BaseMessage = {
        type: "unknown" as any,
        content: "Unknown content",
        data: { key: "value" }
      };

      const result = formatter.format(unknown);
      expect(result.humanized).toBe("Unknown content");
    });

    it("should fall back to data when no content", () => {
      const noContent: BaseMessage = {
        type: "custom" as any,
        data: { message: "from data" }
      };

      const result = formatter.format(noContent);
      expect(result.humanized).toBe('{"message":"from data"}');
    });
  });

  describe("setFormatOption", () => {
    it("should update format option", () => {
      formatter.setFormatOption("raw");
      const result = formatter.formatError({
        type: "error",
        content: "Test",
        from: "system",
        data: { message: "Test", code: 1 }
      });

      expect(result.raw).toBeDefined();
      expect(result.humanized).toBeUndefined();
    });

    it("should validate format option", () => {
      expect(() => formatter.setFormatOption("invalid" as any)).toThrow();
    });
  });

  describe("setIncludeMetadata", () => {
    it("should update metadata inclusion", () => {
      formatter.setIncludeMetadata(true);
      const result = formatter.formatError({
        type: "error",
        content: "Test",
        from: "system",
        data: { message: "Test", code: 1 }
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.messageType).toBe("error");
      expect(result.metadata?.success).toBe(false);
    });
  });

  describe("validateAndFormat (static)", () => {
    it("should detect and format task response", () => {
      const taskResponse: TaskResponseMessage = {
        type: "task_response",
        content: "Task done",
        from: "agent-1",
        content_type: "text/plain",
        data: {
          task_id: "task-123",
          agent_name: "agent-1",
          success: true
        }
      };

      const result = ResponseFormatter.validateAndFormat(taskResponse);
      expect(result.humanized).toContain("[RESPONSE] From agent-1");
      expect(result.humanized).toContain("Task done");
    });

    it("should detect and format agent selected", () => {
      const agentSelected: AgentSelectedMessage = {
        type: "agent_selected",
        content: "Selected",
        from: "coordinator",
        reasoning: "Selected for task",
        data: {
          agent_id: "agent-1",
          agent_name: "Agent",
          user_request: "Help"
        }
      };

      const result = ResponseFormatter.validateAndFormat(agentSelected);
      expect(result.humanized).toContain("[AGENT] Coordinator selected Agent");
    });

    it("should detect and format error", () => {
      const error: ErrorMessage = {
        type: "error",
        content: "Error occurred",
        from: "system",
        data: {
          message: "Error occurred",
          code: 500
        }
      };

      const result = ResponseFormatter.validateAndFormat(error);
      expect(result.humanized).toBe("[ERROR] Error occurred (Code: 500)");
    });

    it("should fall back to generic format for unknown types", () => {
      const unknown = {
        type: "message",
        content: "Generic message",
        from: "user"
      };

      const result = ResponseFormatter.validateAndFormat(unknown);
      expect(result.humanized).toContain("[MESSAGE] user: Generic message");
    });

    it("should use provided format options", () => {
      const message = {
        type: "error",
        content: "Test",
        from: "system",
        data: { message: "Test", code: 1 }
      };

      const rawResult = ResponseFormatter.validateAndFormat(message, {
        format: "raw",
        includeMetadata: false
      });
      expect(rawResult.raw).toBeDefined();
      expect(rawResult.humanized).toBeUndefined();
      expect(rawResult.metadata).toBeUndefined();

      const bothWithMeta = ResponseFormatter.validateAndFormat(message, {
        format: "both",
        includeMetadata: true
      });
      expect(bothWithMeta.raw).toBeDefined();
      expect(bothWithMeta.humanized).toBeDefined();
      expect(bothWithMeta.metadata).toBeDefined();
    });
  });

  describe("private formatting helpers", () => {
    describe("formatJSON", () => {
      it("should format nested objects", () => {
        const json = { level1: { level2: { value: "deep" } } };
        const result = (formatter as any).formatJSON(json);

        expect(result).toContain("level1:");
        expect(result).toContain("  level2:");
        expect(result).toContain("    value: deep");
      });

      it("should handle null and undefined", () => {
        expect((formatter as any).formatJSON(null)).toBe("null");
        expect((formatter as any).formatJSON(undefined)).toBe("null");
      });

      it("should handle primitive values", () => {
        expect((formatter as any).formatJSON("string")).toBe("string");
        expect((formatter as any).formatJSON(123)).toBe("123");
        expect((formatter as any).formatJSON(true)).toBe("true");
      });
    });

    describe("formatArray", () => {
      it("should format simple arrays", () => {
        const result = (formatter as any).formatArray([1, 2, 3]);
        expect(result).toContain("[0]: 1");
        expect(result).toContain("[1]: 2");
        expect(result).toContain("[2]: 3");
      });

      it("should format arrays with objects", () => {
        const arr = [{ key: "value1" }, { key: "value2" }];
        const result = (formatter as any).formatArray(arr);

        expect(result).toContain("[0]:");
        expect(result).toContain("key: value1");
        expect(result).toContain("[1]:");
        expect(result).toContain("key: value2");
      });

      it("should handle empty arrays", () => {
        expect((formatter as any).formatArray([])).toBe("[]");
      });
    });
  });

  describe("edge cases", () => {
    it("should handle responses with missing fields gracefully", () => {
      const incomplete = {
        type: "task_response"
        // Missing required fields will be caught by validation
      } as any;

      expect(() => formatter.formatTaskResponse(incomplete)).toThrow();
    });

    it("should handle very large content", () => {
      const largeContent = "x".repeat(100000);
      const message: TaskResponseMessage = {
        type: "task_response",
        content: largeContent,
        from: "agent-1",
        content_type: "text/plain",
        data: {
          task_id: "task-large",
          success: true
        }
      };

      const result = formatter.formatTaskResponse(message);
      expect(result.humanized).toContain(largeContent);
    });

    it("should handle special characters in content", () => {
      const specialContent = 'Hello\nWorld\t"Quoted"\n\n• Bullet';
      const message: TaskResponseMessage = {
        type: "task_response",
        content: specialContent,
        from: "agent-1",
        content_type: "text/plain",
        data: {
          task_id: "task-special",
          success: true
        }
      };

      const result = formatter.formatTaskResponse(message);
      expect(result.humanized).toContain(specialContent);
    });

    it("should handle unicode content", () => {
      const unicodeContent = "Hello 世界 🌍 مرحبا мир";
      const message: TaskResponseMessage = {
        type: "task_response",
        content: unicodeContent,
        from: "agent-1",
        content_type: "text/plain",
        data: {
          task_id: "task-unicode",
          success: true
        }
      };

      const result = formatter.formatTaskResponse(message);
      expect(result.humanized).toContain(unicodeContent);
    });

    it("should handle circular references gracefully", () => {
      const circular: any = { a: {} };
      circular.a.b = circular;

      const message: TaskResponseMessage = {
        type: "task_response",
        content: JSON.stringify({ safe: "content" }),
        from: "agent-1",
        content_type: "application/json",
        data: {
          task_id: "task-circular",
          success: true
        }
      };

      // Should not throw
      const result = formatter.formatTaskResponse(message);
      expect(result.humanized).toBeDefined();
    });
  });
});
