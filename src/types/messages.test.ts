import { describe, expect, it } from "vitest";
import {
  AgentsListMessageSchema,
  AuthMessageSchema,
  AuthSuccessMessageSchema,
  BaseMessageSchema,
  ErrorMessageSchema,
  MessageTypeSchema,
  RoomSchema,
  TaskResponseMessageSchema,
  isAgentSelected,
  isAuthError,
  isAuthSuccess,
  isChallenge,
  isError,
  isTaskResponse,
  safeParseMessage
} from "./messages";

describe("stringToBoolean transform", () => {
  // Test stringToBoolean indirectly through RoomSchema which uses it for is_public and is_active

  const createTestRoom = (is_public: any, is_active: any) => ({
    id: "room-1",
    name: "Test Room",
    is_public,
    is_active,
    created_by: "user-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z"
  });

  describe("valid truthy values", () => {
    it("should accept boolean true", () => {
      const room = createTestRoom(true, true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(true);
        expect(result.data.is_active).toBe(true);
      }
    });

    it('should accept "true" string', () => {
      const room = createTestRoom("true", "true");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(true);
        expect(result.data.is_active).toBe(true);
      }
    });

    it('should accept "1" string', () => {
      const room = createTestRoom("1", "1");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(true);
        expect(result.data.is_active).toBe(true);
      }
    });

    it('should accept "yes" string', () => {
      const room = createTestRoom("yes", "yes");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(true);
        expect(result.data.is_active).toBe(true);
      }
    });

    it("should accept case variations (TRUE, Yes, YES)", () => {
      const testCases = ["TRUE", "Yes", "YES"];
      testCases.forEach((value) => {
        const room = createTestRoom(value, value);
        const result = RoomSchema.safeParse(room);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.is_public).toBe(true);
          expect(result.data.is_active).toBe(true);
        }
      });
    });

    it("should trim whitespace for truthy values", () => {
      const room = createTestRoom("  true  ", "\t1\n");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(true);
        expect(result.data.is_active).toBe(true);
      }
    });
  });

  describe("valid falsy values", () => {
    it("should accept boolean false", () => {
      const room = createTestRoom(false, false);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(false);
        expect(result.data.is_active).toBe(false);
      }
    });

    it('should accept "false" string', () => {
      const room = createTestRoom("false", "false");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(false);
        expect(result.data.is_active).toBe(false);
      }
    });

    it('should accept "0" string', () => {
      const room = createTestRoom("0", "0");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(false);
        expect(result.data.is_active).toBe(false);
      }
    });

    it('should accept "no" string', () => {
      const room = createTestRoom("no", "no");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(false);
        expect(result.data.is_active).toBe(false);
      }
    });

    it("should accept case variations (FALSE, No, NO)", () => {
      const testCases = ["FALSE", "No", "NO"];
      testCases.forEach((value) => {
        const room = createTestRoom(value, value);
        const result = RoomSchema.safeParse(room);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.is_public).toBe(false);
          expect(result.data.is_active).toBe(false);
        }
      });
    });

    it("should trim whitespace for falsy values", () => {
      const room = createTestRoom("  false  ", "\t0\n");
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_public).toBe(false);
        expect(result.data.is_active).toBe(false);
      }
    });
  });

  describe("invalid values (should throw)", () => {
    it('should reject "maybe"', () => {
      const room = createTestRoom("maybe", true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Invalid boolean value");
      }
    });

    it("should reject empty string", () => {
      const room = createTestRoom("", true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(false);
    });

    it('should reject "invalid"', () => {
      const room = createTestRoom("invalid", true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(false);
    });

    it("should reject random strings", () => {
      const room = createTestRoom("randomstring", true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(false);
    });

    it("should reject numeric strings other than 0/1", () => {
      const invalidNumbers = ["2", "42", "-1", "3.14"];
      invalidNumbers.forEach((value) => {
        const room = createTestRoom(value, true);
        const result = RoomSchema.safeParse(room);
        expect(result.success).toBe(false);
      });
    });

    it("should include helpful error message", () => {
      const room = createTestRoom("maybe", true);
      const result = RoomSchema.safeParse(room);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage = result.error.message;
        expect(errorMessage).toContain("Invalid boolean value");
        expect(errorMessage).toContain("maybe");
        expect(errorMessage).toContain("true/false");
      }
    });
  });

  describe("optional usage (common pattern)", () => {
    // Test with AuthSuccessMessageSchema which has optional boolean fields
    it("should accept undefined for optional boolean fields", () => {
      const message = {
        type: "auth_success" as const,
        data: {
          id: "client-123",
          type: "user" as const,
          address: "0x1234567890123456789012345678901234567890"
          // nft_verified, is_whitelisted, cached_auth are optional - not included
        }
      };
      const result = AuthSuccessMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate when optional boolean field is present and valid", () => {
      const message = {
        type: "auth_success" as const,
        data: {
          id: "client-123",
          type: "user" as const,
          address: "0x1234567890123456789012345678901234567890",
          nft_verified: "true",
          is_whitelisted: "1",
          cached_auth: "yes"
        }
      };
      const result = AuthSuccessMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.nft_verified).toBe(true);
        expect(result.data.data.is_whitelisted).toBe(true);
        expect(result.data.data.cached_auth).toBe(true);
      }
    });

    it("should reject when optional boolean field has invalid value", () => {
      const message = {
        type: "auth_success" as const,
        data: {
          id: "client-123",
          type: "user" as const,
          address: "0x1234567890123456789012345678901234567890",
          nft_verified: "invalid_value"
        }
      };
      const result = AuthSuccessMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });
});

describe("Message Type Schemas", () => {
  describe("MessageTypeSchema", () => {
    it("should validate all valid message types", () => {
      const validTypes = [
        "request_challenge",
        "challenge",
        "check_cached_auth",
        "auth",
        "auth_success",
        "auth_error",
        "register",
        "registration_success",
        "message",
        "task",
        "task_response",
        "agent_selected",
        "agents",
        "error",
        "ping",
        "pong",
        "capabilities",
        "room_join",
        "room_leave"
      ];

      validTypes.forEach((type) => {
        const result = MessageTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(type);
        }
      });
    });

    it("should reject invalid message types", () => {
      const invalidTypes = ["invalid", "auth_request", "MESSAGE", "", null, undefined, 123];

      invalidTypes.forEach((type) => {
        const result = MessageTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("BaseMessageSchema", () => {
    it("should validate a minimal base message", () => {
      const message = {
        type: "ping"
      };
      const result = BaseMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate a base message with all optional fields", () => {
      const message = {
        type: "ping",
        id: "msg-123",
        timestamp: "2024-01-01T00:00:00Z"
      };
      const result = BaseMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("msg-123");
        expect(result.data.timestamp).toBe("2024-01-01T00:00:00Z");
      }
    });

    it("should reject messages without type", () => {
      const message = { id: "msg-123" };
      const result = BaseMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  describe("AuthMessageSchema", () => {
    it("should validate a valid auth message", () => {
      const message = {
        type: "auth",
        data: {
          address: "0x1234567890123456789012345678901234567890",
          signature: "0xsignature",
          message: "challenge-string",
          userType: "user"
        }
      };
      const result = AuthMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate auth message with optional fields", () => {
      const message = {
        type: "auth",
        data: {
          address: "0x1234567890123456789012345678901234567890",
          signature: "0xsignature",
          message: "challenge-string",
          userType: "user"
        }
      };
      const result = AuthMessageSchema.safeParse(message);
      expect(result.success).toBe(true); // All fields in data are optional
    });

    it("should accept auth message with minimal or no data fields", () => {
      const validMessages = [
        { type: "auth" },
        { type: "auth", data: {} },
        { type: "auth", data: { address: "0x123" } },
        { type: "auth", data: { signature: "0xsig" } }
      ];

      validMessages.forEach((msg) => {
        const result = AuthMessageSchema.safeParse(msg);
        expect(result.success).toBe(true); // Schema is permissive - all fields are optional
      });
    });
  });

  describe("AuthSuccessMessageSchema", () => {
    it("should validate auth success message", () => {
      const message = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0x1234567890123456789012345678901234567890",
          is_whitelisted: true,
          rooms: [],
          nft_verified: false
        }
      };
      const result = AuthSuccessMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate auth success with minimal fields", () => {
      const message = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0x1234567890123456789012345678901234567890"
        }
      };
      const result = AuthSuccessMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe("ErrorMessageSchema", () => {
    it("should validate error message", () => {
      const message = {
        type: "error",
        content: "Something went wrong",
        from: "system",
        data: {
          code: 500,
          message: "Internal server error",
          details: { field: "value" }
        }
      };
      const result = ErrorMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate error with minimal fields", () => {
      const message = {
        type: "error",
        content: "Something went wrong",
        from: "system",
        data: {
          code: 400,
          message: "Bad request"
        }
      };
      const result = ErrorMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe("TaskResponseMessageSchema", () => {
    it("should validate task response message", () => {
      const message = {
        type: "task_response",
        content: "Task completed successfully",
        content_type: "text/plain",
        from: "agent-1",
        data: {
          task_id: "task-123",
          success: true,
          agent_name: "Test Agent",
          format: "text" as const
        },
        requestId: "req-123",
        timestamp: "2024-01-01T00:00:00Z"
      };
      const result = TaskResponseMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe("AgentsListMessageSchema", () => {
    it("should validate agents list message", () => {
      const message = {
        type: "agents",
        from: "system",
        data: [
          {
            id: "agent-1",
            name: "Agent 1",
            room: "room-1",
            status: "online"
          }
        ]
      };
      const result = AgentsListMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate empty agents list", () => {
      const message = {
        type: "agents",
        from: "system",
        data: []
      };
      const result = AgentsListMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });
});

describe("Message Type Guards", () => {
  describe("isAuthSuccess", () => {
    it("should identify auth success messages", () => {
      const message = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0x123"
        }
      };
      expect(isAuthSuccess(message)).toBe(true);
    });

    it("should reject non-auth success messages", () => {
      expect(isAuthSuccess({ type: "auth_error", data: { message: "error" } })).toBe(false);
      expect(isAuthSuccess({ type: "challenge", data: { challenge: "ch" } })).toBe(false);
    });
  });

  describe("isAuthError", () => {
    it("should identify auth error messages", () => {
      const message = {
        type: "auth_error",
        data: { error: "Authentication failed" }
      };
      expect(isAuthError(message)).toBe(true);
    });

    it("should reject non-auth error messages", () => {
      expect(
        isAuthError({
          type: "auth_success",
          data: { id: "id", type: "user", address: "0x" }
        })
      ).toBe(false);
    });
  });

  describe("isChallenge", () => {
    it("should identify challenge messages", () => {
      const message = {
        type: "challenge",
        data: { challenge: "challenge-string", timestamp: Date.now() }
      };
      expect(isChallenge(message)).toBe(true);
    });
  });

  describe("isError", () => {
    it("should identify error messages", () => {
      const message = {
        type: "error",
        content: "Something went wrong",
        from: "system",
        data: {
          code: 500,
          message: "Internal error"
        }
      };
      expect(isError(message)).toBe(true);
    });
  });

  describe("isTaskResponse", () => {
    it("should identify task response", () => {
      const message = {
        type: "task_response",
        content: "Task completed",
        content_type: "text/plain",
        from: "agent-1",
        data: {
          task_id: "task-123",
          success: true
        }
      };
      expect(isTaskResponse(message)).toBe(true);
    });
  });

  describe("isAgentSelected", () => {
    it("should identify agent selected messages", () => {
      const message = {
        type: "agent_selected",
        content: "Agent selected",
        from: "coordinator",
        reasoning: "Best match",
        data: {
          agent_id: "agent-1",
          agent_name: "Test Agent",
          user_request: "help"
        }
      };
      expect(isAgentSelected(message)).toBe(true);
    });
  });
});

describe("safeParseMessage", () => {
  it("should parse valid messages", () => {
    const validMessage = {
      type: "ping",
      id: "msg-123"
    };
    const result = safeParseMessage(validMessage);
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.type).toBe("ping");
    }
  });

  it("should accept 'message' without room", () => {
    const msg = {
      type: "message" as const,
      content: "hello"
    };
    const result = safeParseMessage(msg);
    expect(result.success).toBe(true);
  });

  it("should handle invalid messages", () => {
    const invalidMessages = [
      { type: "invalid_type" },
      { no_type: "field" },
      "not an object",
      null,
      undefined,
      123
    ];

    invalidMessages.forEach((msg) => {
      const result = safeParseMessage(msg);
      expect(result.success).toBe(false);
    });
  });

  it("should parse complex task response", () => {
    const complexMessage = {
      type: "task_response",
      content: "Here is my response",
      content_type: "text/plain",
      from: "agent-1",
      data: {
        task_id: "task-123",
        agent_name: "Complex Agent",
        success: true,
        error: undefined
      },
      requestId: "req-complex-123",
      timestamp: "2024-01-01T12:00:00Z"
    };

    const result = safeParseMessage(complexMessage);
    expect(result.success).toBe(true);
    if (result.success && result.data && result.data.type === "task_response") {
      expect(result.data.data.task_id).toBe("task-123");
      expect(result.data.data.agent_name).toBe("Complex Agent");
      expect(result.data.data.success).toBe(true);
      expect(result.data.content).toBe("Here is my response");
    }
  });
});
