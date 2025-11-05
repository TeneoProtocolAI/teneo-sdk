/**
 * Unit tests for RoomManagementManager
 * Tests room CRUD operations, validation, caching, and error handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RoomManagementManager } from "../../../src/managers/room-management-manager";
import { WebSocketClient } from "../../../src/core/websocket-client";
import { Logger, RoomInfo } from "../../../src/types";
import { ErrorCode } from "../../../src/types/error-codes";

describe("RoomManagementManager", () => {
  let manager: RoomManagementManager;
  let mockWsClient: WebSocketClient;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Create mock WebSocket client
    mockWsClient = {
      isConnected: true,
      sendMessage: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Create manager instance
    manager = new RoomManagementManager(mockWsClient, mockLogger);
  });

  describe("createRoom", () => {
    it("should create a room successfully", async () => {
      const roomOptions = {
        name: "Test Room",
        description: "Test Description",
        isPublic: false
      };

      const createdRoom: RoomInfo = {
        id: "room-123",
        name: roomOptions.name,
        description: roomOptions.description,
        is_public: false,
        created_by: "user-123",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_owner: true
      };

      // Start create operation
      const createPromise = manager.createRoom(roomOptions);

      // Simulate server response
      setTimeout(() => {
        manager.emit("room:created", createdRoom);
      }, 10);

      const result = await createPromise;

      expect(result).toEqual(createdRoom);
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "create_room",
        data: {
          name: roomOptions.name,
          description: roomOptions.description
        }
      });
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(
        manager.createRoom({ name: "Test Room" })
      ).rejects.toThrow("Not connected to Teneo network");
    });

    it("should validate room name", async () => {
      await expect(manager.createRoom({ name: "" })).rejects.toThrow("Room name cannot be empty");

      await expect(
        manager.createRoom({ name: "a".repeat(101) })
      ).rejects.toThrow("Room name too long");
    });

    it("should validate room description", async () => {
      await expect(
        manager.createRoom({
          name: "Test",
          description: "a".repeat(501)
        })
      ).rejects.toThrow("Room description too long");
    });

    it("should check room limit before creating private room", async () => {
      manager.setRoomLimit(1);
      manager.setOwnedRooms([
        {
          id: "room-1",
          name: "Existing Room",
          is_owner: true
        } as RoomInfo
      ]);

      await expect(
        manager.createRoom({ name: "New Room", isPublic: false })
      ).rejects.toThrow("Room limit reached");
    });

    it("should not check limit for public rooms", async () => {
      manager.setRoomLimit(0);

      const createPromise = manager.createRoom({
        name: "Public Room",
        isPublic: true
      });

      setTimeout(() => {
        manager.emit("room:created", {
          id: "room-123",
          name: "Public Room",
          is_public: true,
          is_owner: true
        } as RoomInfo);
      }, 10);

      await expect(createPromise).resolves.toBeDefined();
    });

    it("should timeout if no response", async () => {
      vi.useFakeTimers();

      const createPromise = manager.createRoom({ name: "Test Room" });

      vi.advanceTimersByTime(30001);

      await expect(createPromise).rejects.toThrow("timeout");

      vi.useRealTimers();
    });

    it("should handle create errors", async () => {
      const createPromise = manager.createRoom({ name: "Test Room" });

      setTimeout(() => {
        manager.emit("room:create_error", new Error("Server error"));
      }, 10);

      await expect(createPromise).rejects.toThrow("Server error");
    });
  });

  describe("updateRoom", () => {
    beforeEach(() => {
      manager.setOwnedRooms([
        {
          id: "room-123",
          name: "Original Room",
          is_owner: true
        } as RoomInfo
      ]);
    });

    it("should update a room successfully", async () => {
      const updates = {
        name: "Updated Room",
        description: "Updated Description"
      };

      const updatedRoom: RoomInfo = {
        id: "room-123",
        name: updates.name,
        description: updates.description,
        is_owner: true
      } as RoomInfo;

      const updatePromise = manager.updateRoom("room-123", updates);

      setTimeout(() => {
        manager.emit("room:updated", updatedRoom);
      }, 10);

      const result = await updatePromise;

      expect(result).toEqual(updatedRoom);
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "update_room",
        data: {
          room_id: "room-123",
          name: updates.name,
          description: updates.description
        }
      });
    });

    it("should reject if user doesn't own room", async () => {
      await expect(
        manager.updateRoom("room-999", { name: "New Name" })
      ).rejects.toThrow("don't own this room");
    });

    it("should require at least one field", async () => {
      await expect(manager.updateRoom("room-123", {})).rejects.toThrow(
        "At least one field"
      );
    });

    it("should validate updated name", async () => {
      await expect(
        manager.updateRoom("room-123", { name: "" })
      ).rejects.toThrow("Room name cannot be empty");
    });

    it("should validate updated description", async () => {
      await expect(
        manager.updateRoom("room-123", { description: "a".repeat(501) })
      ).rejects.toThrow("Room description too long");
    });
  });

  describe("deleteRoom", () => {
    beforeEach(() => {
      manager.setOwnedRooms([
        {
          id: "room-123",
          name: "Room to Delete",
          is_owner: true
        } as RoomInfo
      ]);
    });

    it("should delete a room successfully", async () => {
      const deletePromise = manager.deleteRoom("room-123");

      setTimeout(() => {
        manager.emit("room:deleted", "room-123");
      }, 10);

      await expect(deletePromise).resolves.toBeUndefined();
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "delete_room",
        data: {
          room_id: "room-123"
        }
      });
    });

    it("should reject if user doesn't own room", async () => {
      await expect(manager.deleteRoom("room-999")).rejects.toThrow("don't own this room");
    });

    it("should handle delete errors", async () => {
      const deletePromise = manager.deleteRoom("room-123");

      setTimeout(() => {
        manager.emit("room:delete_error", new Error("Cannot delete"), "room-123");
      }, 10);

      await expect(deletePromise).rejects.toThrow("Cannot delete");
    });
  });

  describe("Query Methods", () => {
    it("should return owned rooms", () => {
      const ownedRooms: RoomInfo[] = [
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: true } as RoomInfo
      ];

      manager.setOwnedRooms(ownedRooms);

      const result = manager.getOwnedRooms();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("room-1");
      expect(result[1].id).toBe("room-2");
    });

    it("should return shared rooms", () => {
      const sharedRooms: RoomInfo[] = [
        { id: "room-3", name: "Shared 1", is_owner: false } as RoomInfo,
        { id: "room-4", name: "Shared 2", is_owner: false } as RoomInfo
      ];

      manager.setSharedRooms(sharedRooms);

      const result = manager.getSharedRooms();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("room-3");
    });

    it("should get room by ID from owned rooms", () => {
      manager.setOwnedRooms([
        { id: "room-1", name: "Owned Room", is_owner: true } as RoomInfo
      ]);

      const result = manager.getRoomById("room-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Owned Room");
    });

    it("should get room by ID from shared rooms", () => {
      manager.setSharedRooms([
        { id: "room-2", name: "Shared Room", is_owner: false } as RoomInfo
      ]);

      const result = manager.getRoomById("room-2");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Shared Room");
    });

    it("should return undefined for non-existent room", () => {
      const result = manager.getRoomById("room-999");
      expect(result).toBeUndefined();
    });

    it("should get room limit", () => {
      manager.setRoomLimit(5);
      expect(manager.getRoomLimit()).toBe(5);
    });

    it("should get owned room count", () => {
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: true } as RoomInfo,
        { id: "room-3", name: "Room 3", is_owner: true } as RoomInfo
      ]);

      expect(manager.getOwnedRoomCount()).toBe(3);
    });

    it("should check if can create room", () => {
      manager.setRoomLimit(3);
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: true } as RoomInfo
      ]);

      expect(manager.canCreateRoom()).toBe(true);

      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo,
        { id: "room-2", name: "Room 2", is_owner: true } as RoomInfo,
        { id: "room-3", name: "Room 3", is_owner: true } as RoomInfo
      ]);

      expect(manager.canCreateRoom()).toBe(false);
    });
  });

  describe("Cache Management", () => {
    it("should upsert owned room", () => {
      const room: RoomInfo = {
        id: "room-1",
        name: "New Room",
        is_owner: true
      } as RoomInfo;

      manager.upsertRoom(room);

      const result = manager.getRoomById("room-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("New Room");
      expect(manager.getOwnedRoomCount()).toBe(1);
    });

    it("should upsert shared room", () => {
      const room: RoomInfo = {
        id: "room-2",
        name: "Shared Room",
        is_owner: false
      } as RoomInfo;

      manager.upsertRoom(room);

      const result = manager.getRoomById("room-2");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Shared Room");
      expect(manager.getSharedRooms()).toHaveLength(1);
      expect(manager.getOwnedRoomCount()).toBe(0);
    });

    it("should move room from shared to owned when ownership changes", () => {
      const room: RoomInfo = {
        id: "room-1",
        name: "Room",
        is_owner: false
      } as RoomInfo;

      manager.upsertRoom(room);
      expect(manager.getSharedRooms()).toHaveLength(1);
      expect(manager.getOwnedRoomCount()).toBe(0);

      // Update to owned
      room.is_owner = true;
      manager.upsertRoom(room);
      expect(manager.getSharedRooms()).toHaveLength(0);
      expect(manager.getOwnedRoomCount()).toBe(1);
    });

    it("should remove room from cache", () => {
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo
      ]);

      expect(manager.getRoomById("room-1")).toBeDefined();

      manager.removeRoom("room-1");

      expect(manager.getRoomById("room-1")).toBeUndefined();
      expect(manager.getOwnedRoomCount()).toBe(0);
    });

    it("should clear all caches", () => {
      manager.setRoomLimit(5);
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo
      ]);
      manager.setSharedRooms([
        { id: "room-2", name: "Room 2", is_owner: false } as RoomInfo
      ]);

      manager.clearCaches();

      expect(manager.getOwnedRoomCount()).toBe(0);
      expect(manager.getSharedRooms()).toHaveLength(0);
      expect(manager.getRoomLimit()).toBe(1); // Reset to default
    });
  });

  describe("Return Value Immutability", () => {
    it("should return defensive copies from getOwnedRooms", () => {
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo
      ]);

      const rooms1 = manager.getOwnedRooms();
      const rooms2 = manager.getOwnedRooms();

      expect(rooms1).not.toBe(rooms2);
      expect(rooms1[0]).not.toBe(rooms2[0]);
    });

    it("should return defensive copy from getRoomById", () => {
      manager.setOwnedRooms([
        { id: "room-1", name: "Room 1", is_owner: true } as RoomInfo
      ]);

      const room1 = manager.getRoomById("room-1");
      const room2 = manager.getRoomById("room-1");

      expect(room1).not.toBe(room2);
    });
  });
});
