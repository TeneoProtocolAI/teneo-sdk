/**
 * Unit tests for RoomOperationResponseHandler
 * Tests response handling for room CRUD operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RoomOperationResponseHandler } from "../../../src/handlers/message-handlers/room-operation-response-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { RoomInfo, Logger } from "../../../src/types";
import { SDKError } from "../../../src/types/events";
import { ErrorCode } from "../../../src/types/error-codes";

describe("RoomOperationResponseHandler", () => {
  let handler: RoomOperationResponseHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let mockRoomManagementManager: any;
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

    // Create mock room management manager
    mockRoomManagementManager = {
      upsertRoom: vi.fn(),
      removeRoom: vi.fn()
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
      roomManagementManager: mockRoomManagementManager
    };

    // Create handler instance
    handler = new RoomOperationResponseHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("room_operation_response");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "room_operation_response", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Success Responses - Create/Update (with room object)", () => {
    it("should handle successful create/update with room object", async () => {
      const room: RoomInfo = {
        id: "room-123",
        name: "Test Room",
        description: "Test Description",
        is_public: false,
        created_by: "user-123",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_owner: true
      };

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      await handler.handle(message, mockContext);

      // Should update cache
      expect(mockRoomManagementManager.upsertRoom).toHaveBeenCalledWith(room);

      // Should emit both created and updated events
      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
      expect(emitSpy).toHaveBeenCalledWith("room:updated", room);

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "room_operation",
        expect.objectContaining({
          success: true,
          room
        }),
        undefined
      );

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Room operation succeeded",
        expect.objectContaining({
          roomId: room.id,
          roomName: room.name
        })
      );
    });

    it("should handle success with minimal room data", async () => {
      const room: RoomInfo = {
        id: "room-456",
        name: "Minimal Room",
        is_owner: false
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      await handler.handle(message, mockContext);

      expect(mockRoomManagementManager.upsertRoom).toHaveBeenCalledWith(room);
      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
      expect(emitSpy).toHaveBeenCalledWith("room:updated", room);
    });

    it("should work without roomManagementManager in context", async () => {
      const contextWithoutManager = { ...mockContext, roomManagementManager: undefined };
      const room: RoomInfo = {
        id: "room-789",
        name: "Test Room",
        is_owner: true
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      await handler.handle(message, contextWithoutManager);

      // Should still emit events
      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
      expect(emitSpy).toHaveBeenCalledWith("room:updated", room);
    });
  });

  describe("Success Responses - Delete (with room_id only)", () => {
    it("should handle successful delete with room_id", async () => {
      const roomId = "room-123";

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room_id: roomId
        }
      };

      await handler.handle(message, mockContext);

      // Should remove from cache
      expect(mockRoomManagementManager.removeRoom).toHaveBeenCalledWith(roomId);

      // Should emit deleted event
      expect(emitSpy).toHaveBeenCalledWith("room:deleted", roomId);

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "room_deleted",
        expect.objectContaining({
          success: true,
          room_id: roomId
        }),
        undefined
      );

      // Should log
      expect(mockLogger.info).toHaveBeenCalledWith("Room deleted", { roomId });
    });

    it("should work without roomManagementManager for delete", async () => {
      const contextWithoutManager = { ...mockContext, roomManagementManager: undefined };
      const roomId = "room-456";

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room_id: roomId
        }
      };

      await handler.handle(message, contextWithoutManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("room:deleted", roomId);
    });
  });

  describe("Error Responses", () => {
    it("should handle error response with message", async () => {
      const errorMessage = "Room name already exists";
      const roomId = "room-123";

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: false,
          message: errorMessage,
          room_id: roomId
        }
      };

      await handler.handle(message, mockContext);

      // Should emit all error events (since we can't determine operation type)
      expect(emitSpy).toHaveBeenCalledWith("room:create_error", expect.any(SDKError));
      expect(emitSpy).toHaveBeenCalledWith("room:update_error", expect.any(SDKError), roomId);
      expect(emitSpy).toHaveBeenCalledWith("room:delete_error", expect.any(SDKError), roomId);

      // Verify error details
      const createErrorCall = emitSpy.mock.calls.find((call) => call[0] === "room:create_error");
      const error = createErrorCall[1] as SDKError;
      expect(error.message).toBe(errorMessage);
      expect(error.code).toBe(ErrorCode.OPERATION_FAILED);

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "room_operation_error",
        expect.objectContaining({
          success: false,
          message: errorMessage,
          room_id: roomId
        }),
        undefined
      );

      // Should not update cache
      expect(mockRoomManagementManager.upsertRoom).not.toHaveBeenCalled();
      expect(mockRoomManagementManager.removeRoom).not.toHaveBeenCalled();
    });

    it("should handle error without message", async () => {
      const message = {
        type: "room_operation_response" as const,
        data: {
          success: false
        }
      };

      await handler.handle(message, mockContext);

      // Should use default error message
      const createErrorCall = emitSpy.mock.calls.find((call) => call[0] === "room:create_error");
      const error = createErrorCall[1] as SDKError;
      expect(error.message).toBe("Room operation failed");
    });

    it("should handle error without room_id", async () => {
      const message = {
        type: "room_operation_response" as const,
        data: {
          success: false,
          message: "Generic error"
        }
      };

      await handler.handle(message, mockContext);

      // Should still emit error events
      expect(emitSpy).toHaveBeenCalledWith("room:create_error", expect.any(SDKError));
      expect(emitSpy).toHaveBeenCalledWith("room:update_error", expect.any(SDKError), undefined);
      expect(emitSpy).toHaveBeenCalledWith("room:delete_error", expect.any(SDKError), undefined);
    });
  });

  describe("Edge Cases", () => {
    it("should handle success without room or room_id", async () => {
      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true
        }
      };

      await handler.handle(message, mockContext);

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Room operation succeeded but no room data provided"
      );

      // Should not emit any success events
      expect(emitSpy).not.toHaveBeenCalledWith("room:created", expect.anything());
      expect(emitSpy).not.toHaveBeenCalledWith("room:updated", expect.anything());
      expect(emitSpy).not.toHaveBeenCalledWith("room:deleted", expect.anything());

      // Should not update cache
      expect(mockRoomManagementManager.upsertRoom).not.toHaveBeenCalled();
      expect(mockRoomManagementManager.removeRoom).not.toHaveBeenCalled();
    });

    it("should handle roomManagementManager without upsertRoom method", async () => {
      const invalidManager = { someOtherMethod: vi.fn() };
      const contextWithInvalidManager = {
        ...mockContext,
        roomManagementManager: invalidManager
      };

      const room: RoomInfo = {
        id: "room-123",
        name: "Test Room",
        is_owner: true
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      // Should not throw
      await handler.handle(message, contextWithInvalidManager);

      // Should still emit events
      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
    });

    it("should handle roomManagementManager without removeRoom method", async () => {
      const invalidManager = { someOtherMethod: vi.fn() };
      const contextWithInvalidManager = {
        ...mockContext,
        roomManagementManager: invalidManager
      };

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-123"
        }
      };

      // Should not throw
      await handler.handle(message, contextWithInvalidManager);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith("room:deleted", "room-123");
    });
  });

  describe("Webhook Errors", () => {
    it("should handle webhook failures gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const room: RoomInfo = {
        id: "room-123",
        name: "Test Room",
        is_owner: true
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      // Should not throw (webhook errors are logged but don't fail the handler)
      await handler.handle(message, mockContext);

      // Should still emit events and update cache
      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
      expect(mockRoomManagementManager.upsertRoom).toHaveBeenCalledWith(room);
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure", async () => {
      const invalidMessage = {
        type: "room_operation_response"
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling room_operation_response"),
        expect.any(Error)
      );

      // Should emit message:error event
      expect(emitSpy).toHaveBeenCalledWith("message:error", expect.any(Error), invalidMessage);
    });

    it("should accept valid message with extra fields", async () => {
      const room: RoomInfo = {
        id: "room-123",
        name: "Test Room",
        is_owner: true
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room,
          extra_field: "should be ignored", // Schema uses .passthrough()
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("room:created", room);
    });
  });

  describe("Debug Logging", () => {
    it("should log debug info for successful operation", async () => {
      const room: RoomInfo = {
        id: "room-123",
        name: "Test Room",
        is_owner: true
      } as RoomInfo;

      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling room_operation_response",
        expect.objectContaining({
          success: true,
          roomId: undefined, // room_id is undefined in this case
          hasRoom: true
        })
      );
    });

    it("should log debug info for delete operation", async () => {
      const message = {
        type: "room_operation_response" as const,
        data: {
          success: true,
          room_id: "room-456"
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling room_operation_response",
        expect.objectContaining({
          success: true,
          roomId: "room-456",
          hasRoom: false
        })
      );
    });
  });
});
