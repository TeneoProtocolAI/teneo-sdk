/**
 * Integration tests for Room Management (v2.0.0)
 * Tests complete room CRUD flow with mock WebSocket server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { TeneoSDK } from "../../src";
import { SDKConfigBuilder } from "../../src/types";
import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";
import { RoomInfo } from "../../src/types";

// TODO: Fix integration test setup - mock server needs proper event handling
describe.skip("Room Management Integration Tests", () => {
  let server: WebSocketServer;
  let sdk: TeneoSDK;
  let serverPort: number;
  let privateKey: string;
  let walletAddress: string;

  // Mock server to simulate Teneo WebSocket server
  beforeAll(() => {
    serverPort = 8082;
    privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    walletAddress = account.address;

    // Create WebSocket server
    server = new WebSocketServer({ port: serverPort });

    // Room storage for testing
    const rooms = new Map<string, RoomInfo>();
    let roomCounter = 1;

    server.on("connection", (ws) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());

        // Handle different message types
        switch (message.type) {
          case "request_challenge":
            ws.send(
              JSON.stringify({
                type: "challenge",
                data: {
                  challenge: "test-challenge-" + Date.now(),
                  timestamp: Date.now()
                }
              })
            );
            break;

          case "auth":
            // Send auth success with room management info
            ws.send(
              JSON.stringify({
                type: "auth_success",
                data: {
                  id: "client-123",
                  type: "user",
                  address: message.data.address,
                  nft_verified: false,
                  is_whitelisted: true,
                  rooms: Array.from(rooms.values()),
                  max_private_rooms: 5 // v2.0: Room limit
                }
              })
            );
            break;

          case "create_room":
            // Create new room
            const newRoomId = `room-${roomCounter++}`;
            const newRoom: RoomInfo = {
              id: newRoomId,
              name: message.name,
              description: message.description,
              is_public: message.is_public || false,
              created_by: walletAddress,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_owner: true
            };
            rooms.set(newRoomId, newRoom);

            // Send success response
            ws.send(
              JSON.stringify({
                type: "room_operation_response",
                data: {
                  success: true,
                  room: newRoom,
                  message: "Room created successfully"
                }
              })
            );
            break;

          case "update_room":
            // Update existing room
            const roomId = message.room_id;
            const existingRoom = rooms.get(roomId);

            if (!existingRoom) {
              ws.send(
                JSON.stringify({
                  type: "room_operation_response",
                  data: {
                    success: false,
                    message: "Room not found",
                    room_id: roomId
                  }
                })
              );
              return;
            }

            // Update room
            const updatedRoom: RoomInfo = {
              ...existingRoom,
              name: message.name ?? existingRoom.name,
              description: message.description ?? existingRoom.description,
              updated_at: new Date().toISOString()
            };
            rooms.set(roomId, updatedRoom);

            // Send success response
            ws.send(
              JSON.stringify({
                type: "room_operation_response",
                data: {
                  success: true,
                  room: updatedRoom,
                  message: "Room updated successfully"
                }
              })
            );
            break;

          case "delete_room":
            // Delete room
            const deleteRoomId = message.room_id;
            const roomToDelete = rooms.get(deleteRoomId);

            if (!roomToDelete) {
              ws.send(
                JSON.stringify({
                  type: "room_operation_response",
                  data: {
                    success: false,
                    message: "Room not found",
                    room_id: deleteRoomId
                  }
                })
              );
              return;
            }

            rooms.delete(deleteRoomId);

            // Send success response
            ws.send(
              JSON.stringify({
                type: "room_operation_response",
                data: {
                  success: true,
                  room_id: deleteRoomId,
                  message: "Room deleted successfully"
                }
              })
            );
            break;

          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
        }
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    // Create SDK instance
    const config = new SDKConfigBuilder()
      .withWebSocketUrl(`ws://localhost:${serverPort}`)
      .withAuthentication(privateKey)
      .withReconnection(false) // Disable for tests
      .build();

    sdk = new TeneoSDK(config);

    // Wait for connection and auth
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);

      sdk.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      sdk.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Connect to server
      sdk.connect().catch(reject);
    });
  });

  afterEach(async () => {
    if (sdk) {
      await sdk.destroy();
    }
  });

  describe("Room Creation", () => {
    it("should create a private room", async () => {
      const roomOptions = {
        name: "Test Private Room",
        description: "A test private room"
      };

      const room = await sdk.createRoom(roomOptions);

      expect(room).toBeDefined();
      expect(room.id).toBeDefined();
      expect(room.name).toBe(roomOptions.name);
      expect(room.description).toBe(roomOptions.description);
      expect(room.is_public).toBe(false);
      expect(room.is_owner).toBe(true);
      expect(room.created_by).toBeDefined();
      expect(room.created_at).toBeDefined();

      // Should be in owned rooms
      const ownedRooms = sdk.getOwnedRooms();
      expect(ownedRooms).toHaveLength(1);
      expect(ownedRooms[0].id).toBe(room.id);
    });


    it("should emit room:created event", async () => {
      const roomOptions = {
        name: "Event Test Room"
      };

      const eventPromise = new Promise<RoomInfo>((resolve) => {
        sdk.once("room:created", (room) => {
          resolve(room);
        });
      });

      const room = await sdk.createRoom(roomOptions);
      const emittedRoom = await eventPromise;

      expect(emittedRoom.id).toBe(room.id);
      expect(emittedRoom.name).toBe(room.name);
    });

    it("should validate room name", async () => {
      await expect(sdk.createRoom({ name: "" })).rejects.toThrow("Room name cannot be empty");

      await expect(sdk.createRoom({ name: "a".repeat(101) })).rejects.toThrow(
        "Room name too long"
      );
    });

    it("should validate room description", async () => {
      await expect(
        sdk.createRoom({
          name: "Test",
          description: "a".repeat(501)
        })
      ).rejects.toThrow("Room description too long");
    });
  });

  describe("Room Updates", () => {
    it("should update room name", async () => {
      // Create room first
      const room = await sdk.createRoom({ name: "Original Name" });

      // Update name
      const updatedRoom = await sdk.updateRoom(room.id, { name: "Updated Name" });

      expect(updatedRoom.id).toBe(room.id);
      expect(updatedRoom.name).toBe("Updated Name");

      // Should be updated in cache
      const cachedRoom = sdk.getRoomById(room.id);
      expect(cachedRoom?.name).toBe("Updated Name");
    });

    it("should update room description", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      const updatedRoom = await sdk.updateRoom(room.id, {
        description: "New description"
      });

      expect(updatedRoom.description).toBe("New description");
    });

    it("should update both name and description", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      const updatedRoom = await sdk.updateRoom(room.id, {
        name: "New Name",
        description: "New description"
      });

      expect(updatedRoom.name).toBe("New Name");
      expect(updatedRoom.description).toBe("New description");
    });

    it("should emit room:updated event", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      const eventPromise = new Promise<RoomInfo>((resolve) => {
        sdk.once("room:updated", (updatedRoom) => {
          resolve(updatedRoom);
        });
      });

      await sdk.updateRoom(room.id, { name: "Updated" });
      const emittedRoom = await eventPromise;

      expect(emittedRoom.id).toBe(room.id);
      expect(emittedRoom.name).toBe("Updated");
    });

    it("should validate update parameters", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      await expect(sdk.updateRoom(room.id, {})).rejects.toThrow("At least one field");

      await expect(sdk.updateRoom(room.id, { name: "" })).rejects.toThrow(
        "Room name cannot be empty"
      );
    });
  });

  describe("Room Deletion", () => {
    it("should delete a room", async () => {
      // Create room first
      const room = await sdk.createRoom({ name: "Room to Delete" });

      expect(sdk.getOwnedRoomCount()).toBe(1);

      // Delete room
      await sdk.deleteRoom(room.id);

      // Should be removed from cache
      expect(sdk.getOwnedRoomCount()).toBe(0);
      expect(sdk.getRoomById(room.id)).toBeUndefined();
    });

    it("should emit room:deleted event", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      const eventPromise = new Promise<string>((resolve) => {
        sdk.once("room:deleted", (roomId) => {
          resolve(roomId);
        });
      });

      await sdk.deleteRoom(room.id);
      const deletedRoomId = await eventPromise;

      expect(deletedRoomId).toBe(room.id);
    });
  });

  describe("Complete Room Lifecycle", () => {
    it("should create, update, and delete a room", async () => {
      // Create
      const room = await sdk.createRoom({
        name: "Lifecycle Test Room",
        description: "Initial description"
      });

      expect(room.name).toBe("Lifecycle Test Room");
      expect(sdk.getOwnedRoomCount()).toBe(1);

      // Update
      const updatedRoom = await sdk.updateRoom(room.id, {
        name: "Updated Lifecycle Room",
        description: "Updated description"
      });

      expect(updatedRoom.name).toBe("Updated Lifecycle Room");
      expect(updatedRoom.description).toBe("Updated description");
      expect(sdk.getOwnedRoomCount()).toBe(1);

      // Delete
      await sdk.deleteRoom(room.id);

      expect(sdk.getOwnedRoomCount()).toBe(0);
      expect(sdk.getRoomById(room.id)).toBeUndefined();
    });
  });

  describe("Room Query Methods", () => {
    it("should get owned rooms", async () => {
      await sdk.createRoom({ name: "Room 1" });
      await sdk.createRoom({ name: "Room 2" });

      const ownedRooms = sdk.getOwnedRooms();
      expect(ownedRooms).toHaveLength(2);
    });

    it("should get room by ID", async () => {
      const room = await sdk.createRoom({ name: "Test Room" });

      const found = sdk.getRoomById(room.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe("Test Room");
    });

    it("should return undefined for non-existent room", () => {
      const room = sdk.getRoomById("non-existent-id");
      expect(room).toBeUndefined();
    });

    it("should get owned room count", async () => {
      expect(sdk.getOwnedRoomCount()).toBe(0);

      await sdk.createRoom({ name: "Room 1" });
      expect(sdk.getOwnedRoomCount()).toBe(1);

      await sdk.createRoom({ name: "Room 2" });
      expect(sdk.getOwnedRoomCount()).toBe(2);
    });

    it("should get room limit", () => {
      const limit = sdk.getRoomLimit();
      expect(limit).toBe(5); // Set in mock server
    });

    it("should check if can create room", () => {
      expect(sdk.canCreateRoom()).toBe(true);
    });
  });

  describe("Return Value Immutability", () => {
    it("should return defensive copies", async () => {
      await sdk.createRoom({ name: "Test Room" });

      const rooms1 = sdk.getOwnedRooms();
      const rooms2 = sdk.getOwnedRooms();

      // Should be different array instances
      expect(rooms1).not.toBe(rooms2);
      // But have same content
      expect(rooms1[0].id).toBe(rooms2[0].id);

      // Modifying returned array shouldn't affect internal state
      rooms1[0].name = "Modified";
      const rooms3 = sdk.getOwnedRooms();
      expect(rooms3[0].name).not.toBe("Modified");
    });
  });

  describe("Multiple Rooms", () => {
    it("should handle creating multiple rooms", async () => {
      const room1 = await sdk.createRoom({ name: "Room 1" });
      const room2 = await sdk.createRoom({ name: "Room 2" });
      const room3 = await sdk.createRoom({ name: "Room 3" });

      expect(sdk.getOwnedRoomCount()).toBe(3);

      const rooms = sdk.getOwnedRooms();
      expect(rooms.map((r) => r.name)).toContain("Room 1");
      expect(rooms.map((r) => r.name)).toContain("Room 2");
      expect(rooms.map((r) => r.name)).toContain("Room 3");
    });

    it("should handle updating multiple rooms", async () => {
      const room1 = await sdk.createRoom({ name: "Room 1" });
      const room2 = await sdk.createRoom({ name: "Room 2" });

      await sdk.updateRoom(room1.id, { name: "Updated Room 1" });
      await sdk.updateRoom(room2.id, { name: "Updated Room 2" });

      const rooms = sdk.getOwnedRooms();
      expect(rooms.find((r) => r.id === room1.id)?.name).toBe("Updated Room 1");
      expect(rooms.find((r) => r.id === room2.id)?.name).toBe("Updated Room 2");
    });

    it("should handle deleting multiple rooms", async () => {
      const room1 = await sdk.createRoom({ name: "Room 1" });
      const room2 = await sdk.createRoom({ name: "Room 2" });
      const room3 = await sdk.createRoom({ name: "Room 3" });

      expect(sdk.getOwnedRoomCount()).toBe(3);

      await sdk.deleteRoom(room1.id);
      expect(sdk.getOwnedRoomCount()).toBe(2);

      await sdk.deleteRoom(room2.id);
      expect(sdk.getOwnedRoomCount()).toBe(1);

      await sdk.deleteRoom(room3.id);
      expect(sdk.getOwnedRoomCount()).toBe(0);
    });
  });
});
