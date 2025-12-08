/**
 * Unit tests for AuthSuccessHandler - Room Management Initialization
 * Tests room categorization and room management manager initialization
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthSuccessHandler } from "../../../src/handlers/message-handlers/auth-success-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { AuthSuccessMessage, RoomInfo, Logger } from "../../../src/types";

describe("AuthSuccessHandler - Room Management", () => {
  let handler: AuthSuccessHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let mockRoomManagementManager: any;
  let emitSpy: ReturnType<typeof vi.fn>;
  let updateAuthStateSpy: ReturnType<typeof vi.fn>;
  let updateConnectionStateSpy: ReturnType<typeof vi.fn>;
  let getAuthStateSpy: ReturnType<typeof vi.fn>;

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
      setRoomLimit: vi.fn(),
      setOwnedRooms: vi.fn(),
      setSharedRooms: vi.fn()
    };

    // Create spies
    emitSpy = vi.fn();
    updateAuthStateSpy = vi.fn();
    updateConnectionStateSpy = vi.fn();
    getAuthStateSpy = vi.fn().mockReturnValue({
      authenticated: true,
      clientId: "client-123",
      walletAddress: "0xabc..."
    });

    // Create mock context
    mockContext = {
      emit: emitSpy,
      sendWebhook: vi.fn().mockResolvedValue(undefined),
      logger: mockLogger,
      getConnectionState: vi.fn(),
      getAuthState: getAuthStateSpy,
      updateConnectionState: updateConnectionStateSpy,
      updateAuthState: updateAuthStateSpy,
      sendMessage: vi.fn(),
      roomManagementManager: mockRoomManagementManager
    };

    // Create handler instance
    handler = new AuthSuccessHandler();
  });

  describe("Room Extraction", () => {
    it("should extract rooms from auth success message", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "My Room",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-2",
          name: "Shared Room",
          is_owner: false
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      // Should update auth state with room data
      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: rooms
        })
      );
    });

    it("should handle missing rooms array", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc..."
          // rooms field is undefined
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      // Should still work with empty array
      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: [],
          privateRoomIds: [],
          sharedRoomIds: []
        })
      );
    });

    it("should handle null rooms", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: null as any
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: []
        })
      );
    });

    it("should handle empty rooms array", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: []
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: [],
          privateRoomIds: [],
          sharedRoomIds: []
        })
      );
    });
  });

  describe("Room Categorization", () => {
    it("should categorize owned rooms (is_owner: true)", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "My Room 1",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-2",
          name: "My Room 2",
          is_owner: true
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          privateRoomIds: ["room-1", "room-2"],
          sharedRoomIds: []
        })
      );
    });

    it("should categorize shared rooms (is_owner: false)", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-3",
          name: "Shared Room 1",
          is_owner: false
        } as RoomInfo,
        {
          id: "room-4",
          name: "Shared Room 2",
          is_owner: false
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          privateRoomIds: [],
          sharedRoomIds: ["room-3", "room-4"]
        })
      );
    });

    it("should categorize mixed owned and shared rooms", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "My Room",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-2",
          name: "Shared Room",
          is_owner: false
        } as RoomInfo,
        {
          id: "room-3",
          name: "Another Owned",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-4",
          name: "Another Shared",
          is_owner: false
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          privateRoomIds: ["room-1", "room-3"],
          sharedRoomIds: ["room-2", "room-4"]
        })
      );
    });

    it("should handle rooms with missing is_owner flag", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "Room without flag"
          // is_owner is undefined
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      // Undefined is_owner should be treated as falsy (shared room)
      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          privateRoomIds: [],
          sharedRoomIds: ["room-1"]
        })
      );
    });
  });

  describe("Room Management Manager Initialization", () => {
    it("should initialize room management manager with room limit", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: [],
          max_private_rooms: 5
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(mockRoomManagementManager.setRoomLimit).toHaveBeenCalledWith(5);
    });

    it("should initialize with owned rooms", async () => {
      const ownedRooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "My Room 1",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-2",
          name: "My Room 2",
          is_owner: true
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: ownedRooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(mockRoomManagementManager.setOwnedRooms).toHaveBeenCalledWith(ownedRooms);
    });

    it("should initialize with shared rooms", async () => {
      const sharedRooms: RoomInfo[] = [
        {
          id: "room-3",
          name: "Shared Room 1",
          is_owner: false
        } as RoomInfo,
        {
          id: "room-4",
          name: "Shared Room 2",
          is_owner: false
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: sharedRooms
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(mockRoomManagementManager.setSharedRooms).toHaveBeenCalledWith(sharedRooms);
    });

    it("should initialize with mixed rooms", async () => {
      const rooms: RoomInfo[] = [
        {
          id: "room-1",
          name: "My Room",
          is_owner: true
        } as RoomInfo,
        {
          id: "room-2",
          name: "Shared Room",
          is_owner: false
        } as RoomInfo,
        {
          id: "room-3",
          name: "Another Owned",
          is_owner: true
        } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms,
          max_private_rooms: 3
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      const ownedRooms = rooms.filter((r) => r.is_owner);
      const sharedRooms = rooms.filter((r) => !r.is_owner);

      expect(mockRoomManagementManager.setRoomLimit).toHaveBeenCalledWith(3);
      expect(mockRoomManagementManager.setOwnedRooms).toHaveBeenCalledWith(ownedRooms);
      expect(mockRoomManagementManager.setSharedRooms).toHaveBeenCalledWith(sharedRooms);
    });

    it("should log debug info after initialization", async () => {
      const rooms: RoomInfo[] = [
        { id: "room-1", name: "Owned", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Shared", is_owner: false } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms,
          max_private_rooms: 5
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Room management initialized",
        expect.objectContaining({
          owned: 1,
          shared: 1,
          limit: 5
        })
      );
    });

    it("should work without room limit", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: []
          // max_private_rooms is undefined
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      // Should not call setRoomLimit
      expect(mockRoomManagementManager.setRoomLimit).not.toHaveBeenCalled();

      // Should still initialize room lists
      expect(mockRoomManagementManager.setOwnedRooms).toHaveBeenCalledWith([]);
      expect(mockRoomManagementManager.setSharedRooms).toHaveBeenCalledWith([]);
    });
  });

  describe("Backward Compatibility", () => {
    it("should include deprecated fields in auth state", async () => {
      const rooms: RoomInfo[] = [
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: false } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms,
          private_room_id: "room-1" // DEPRECATED field
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          rooms: ["room-1", "room-2"], // DEPRECATED: flat list of IDs
          privateRoomId: "room-1" // DEPRECATED: single ID
        })
      );
    });

    it("should include new v2.0 fields in auth state", async () => {
      const rooms: RoomInfo[] = [
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: false } as RoomInfo
      ];

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms,
          max_private_rooms: 3
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: rooms, // v2.0: Full objects
          privateRoomIds: ["room-1"], // v2.0: Owned room IDs
          sharedRoomIds: ["room-2"], // v2.0: Shared room IDs
          maxPrivateRooms: 3 // v2.0: Room limit
        })
      );
    });
  });

  describe("Without Room Management Manager", () => {
    it("should work without roomManagementManager in context", async () => {
      const contextWithoutManager = { ...mockContext, roomManagementManager: undefined };

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: [{ id: "room-1", name: "Room", is_owner: true } as RoomInfo],
          max_private_rooms: 3
        }
      } as AuthSuccessMessage;

      // Should not throw
      await handler.handle(message, contextWithoutManager);

      // Should still update auth state
      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomObjects: expect.any(Array),
          maxPrivateRooms: 3
        })
      );

      // Should still emit events
      expect(emitSpy).toHaveBeenCalledWith("auth:success", expect.anything());
      expect(emitSpy).toHaveBeenCalledWith("ready");
    });

    it("should handle null roomManagementManager", async () => {
      const contextWithNullManager = { ...mockContext, roomManagementManager: null };

      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          rooms: []
        }
      } as AuthSuccessMessage;

      // Should not throw
      await handler.handle(message, contextWithNullManager);

      expect(emitSpy).toHaveBeenCalledWith("ready");
    });
  });

  describe("Event Emission", () => {
    it("should emit auth:success event with auth state", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc..."
        }
      } as AuthSuccessMessage;

      const mockAuthState = {
        authenticated: true,
        clientId: "client-123",
        walletAddress: "0xabc..."
      };
      getAuthStateSpy.mockReturnValue(mockAuthState);

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("auth:success", mockAuthState);
    });

    it("should emit ready event after auth:success", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc..."
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      // Check that ready was emitted
      expect(emitSpy).toHaveBeenCalledWith("ready");

      // Check order: auth:success before ready
      const calls = emitSpy.mock.calls;
      const authSuccessIndex = calls.findIndex((call) => call[0] === "auth:success");
      const readyIndex = calls.findIndex((call) => call[0] === "ready");

      expect(authSuccessIndex).toBeGreaterThanOrEqual(0);
      expect(readyIndex).toBeGreaterThan(authSuccessIndex);
    });

    it("should log authentication success", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc..."
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith("Authentication successful");
    });
  });

  describe("State Updates", () => {
    it("should update connection state to authenticated", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc..."
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateConnectionStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticated: true
        })
      );
    });

    it("should update auth state with all user data", async () => {
      const message: AuthSuccessMessage = {
        type: "auth_success",
        data: {
          id: "client-123",
          type: "user",
          address: "0xabc...",
          is_whitelisted: true,
          is_admin_whitelisted: false,
          nft_verified: true,
          rooms: []
        }
      } as AuthSuccessMessage;

      await handler.handle(message, mockContext);

      expect(updateAuthStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticated: true,
          clientId: "client-123",
          walletAddress: "0xabc...",
          isWhitelisted: true,
          isAdmin: false,
          nftVerified: true
        })
      );
    });
  });
});
