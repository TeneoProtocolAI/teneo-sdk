/**
 * Unit tests for AgentRoomManager
 * Tests agent-room operations, caching, validation, and error handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRoomManager, AgentRoomInfo, PaginatedAgentsResult } from "../../../src/managers/agent-room-manager";
import { RoomManagementManager } from "../../../src/managers/room-management-manager";
import { WebSocketClient } from "../../../src/core/websocket-client";
import { Logger, RoomInfo } from "../../../src/types";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ErrorCode } from "../../../src/types/error-codes";

describe("AgentRoomManager", () => {
  let manager: AgentRoomManager;
  let mockWsClient: WebSocketClient;
  let mockLogger: Logger;
  let mockRoomManagement: RoomManagementManager;

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

    // Create mock room management manager
    mockRoomManagement = {
      getRoomById: vi.fn().mockReturnValue({ id: "room-123", is_owner: true } as RoomInfo),
      getOwnedRooms: vi.fn().mockReturnValue([{ id: "room-123", is_owner: true } as RoomInfo])
    } as any;

    // Create manager instance
    manager = new AgentRoomManager(mockWsClient, mockLogger, mockRoomManagement);
  });

  describe("addAgentToRoom", () => {
    it("should add agent to room successfully", async () => {
      const addPromise = manager.addAgentToRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:agent_added", "room-123", "agent-456");
      }, 10);

      await expect(addPromise).resolves.toBeUndefined();
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "add_agent_to_room",
        data: {
          room_id: "room-123",
          agent_id: "agent-456"
        }
      });
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(manager.addAgentToRoom("room-123", "agent-456")).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );
    });

    it("should validate room ID", async () => {
      await expect(manager.addAgentToRoom("", "agent-456")).rejects.toThrow(
        "Room ID cannot be empty"
      );
    });

    it("should validate agent ID", async () => {
      await expect(manager.addAgentToRoom("room-123", "")).rejects.toThrow(
        "Agent ID cannot be empty"
      );
    });

    it("should check room ownership", async () => {
      mockRoomManagement.getRoomById = vi
        .fn()
        .mockReturnValue({ id: "room-123", is_owner: false } as RoomInfo);
      mockRoomManagement.getOwnedRooms = vi.fn().mockReturnValue([]);

      await expect(manager.addAgentToRoom("room-123", "agent-456")).rejects.toThrow(
        "You don't own this room"
      );
    });

    it("should reject if room not found", async () => {
      mockRoomManagement.getRoomById = vi.fn().mockReturnValue(undefined);

      await expect(manager.addAgentToRoom("room-999", "agent-456")).rejects.toThrow(
        "Room not found"
      );
    });

    it("should timeout if no response", async () => {
      vi.useFakeTimers();

      const addPromise = manager.addAgentToRoom("room-123", "agent-456");

      vi.advanceTimersByTime(30001);

      await expect(addPromise).rejects.toThrow("timeout");

      vi.useRealTimers();
    });

    it("should handle add errors", async () => {
      const addPromise = manager.addAgentToRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:add_error", new Error("Agent already in room"), "room-123");
      }, 10);

      await expect(addPromise).rejects.toThrow("Agent already in room");
    });

    it("should invalidate cache after adding agent", async () => {
      // Pre-populate cache
      const cachedAgents: AgentRoomInfo[] = [{ agent_id: "agent-1", agent_name: "Agent 1" }];
      manager.cacheRoomAgents("room-123", cachedAgents);

      expect(manager.getCachedRoomAgents("room-123")).toHaveLength(1);

      const addPromise = manager.addAgentToRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:agent_added", "room-123", "agent-456");
      }, 10);

      await addPromise;

      // Cache should be invalidated
      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
    });
  });

  describe("removeAgentFromRoom", () => {
    it("should remove agent from room successfully", async () => {
      const removePromise = manager.removeAgentFromRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:agent_removed", "room-123", "agent-456");
      }, 10);

      await expect(removePromise).resolves.toBeUndefined();
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "remove_agent_from_room",
        data: {
          room_id: "room-123",
          agent_id: "agent-456"
        }
      });
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(manager.removeAgentFromRoom("room-123", "agent-456")).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );
    });

    it("should validate room ID", async () => {
      await expect(manager.removeAgentFromRoom("", "agent-456")).rejects.toThrow(
        "Room ID cannot be empty"
      );
    });

    it("should validate agent ID", async () => {
      await expect(manager.removeAgentFromRoom("room-123", "")).rejects.toThrow(
        "Agent ID cannot be empty"
      );
    });

    it("should check room ownership", async () => {
      mockRoomManagement.getRoomById = vi
        .fn()
        .mockReturnValue({ id: "room-123", is_owner: false } as RoomInfo);
      mockRoomManagement.getOwnedRooms = vi.fn().mockReturnValue([]);

      await expect(manager.removeAgentFromRoom("room-123", "agent-456")).rejects.toThrow(
        "You don't own this room"
      );
    });

    it("should handle remove errors", async () => {
      const removePromise = manager.removeAgentFromRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:remove_error", new Error("Agent not in room"), "room-123");
      }, 10);

      await expect(removePromise).rejects.toThrow("Agent not in room");
    });

    it("should invalidate cache after removing agent", async () => {
      // Pre-populate cache
      const cachedAgents: AgentRoomInfo[] = [{ agent_id: "agent-456", agent_name: "Agent 456" }];
      manager.cacheRoomAgents("room-123", cachedAgents);

      expect(manager.getCachedRoomAgents("room-123")).toHaveLength(1);

      const removePromise = manager.removeAgentFromRoom("room-123", "agent-456");

      setTimeout(() => {
        manager.emit("agent_room:agent_removed", "room-123", "agent-456");
      }, 10);

      await removePromise;

      // Cache should be invalidated
      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
    });
  });

  describe("listRoomAgents", () => {
    const mockAgents: AgentRoomInfo[] = [
      { agent_id: "agent-1", agent_name: "Agent 1", status: "online" },
      { agent_id: "agent-2", agent_name: "Agent 2", status: "offline" }
    ];

    it("should list room agents successfully", async () => {
      const listPromise = manager.listRoomAgents("room-123", false);

      setTimeout(() => {
        manager.emit("agent_room:agents_listed", "room-123", mockAgents);
      }, 10);

      const result = await listPromise;

      expect(result).toHaveLength(2);
      expect(result[0].agent_id).toBe("agent-1");
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "list_room_agents",
        data: {
          room_id: "room-123"
        }
      });
    });

    it("should use cached data if available", async () => {
      // Pre-populate cache
      manager.cacheRoomAgents("room-123", mockAgents);

      const result = await manager.listRoomAgents("room-123", true);

      expect(result).toHaveLength(2);
      expect(mockWsClient.sendMessage).not.toHaveBeenCalled();
    });

    it("should bypass cache when useCache is false", async () => {
      // Pre-populate cache
      manager.cacheRoomAgents("room-123", mockAgents);

      const listPromise = manager.listRoomAgents("room-123", false);

      setTimeout(() => {
        manager.emit("agent_room:agents_listed", "room-123", mockAgents);
      }, 10);

      await listPromise;

      expect(mockWsClient.sendMessage).toHaveBeenCalled();
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(manager.listRoomAgents("room-123")).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );
    });

    it("should validate room ID", async () => {
      await expect(manager.listRoomAgents("")).rejects.toThrow("Room ID cannot be empty");
    });

    it("should fetch from server if cache is expired", async () => {
      vi.useFakeTimers();

      // Cache data
      manager.cacheRoomAgents("room-123", mockAgents);

      // Advance time beyond cache TTL (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const listPromise = manager.listRoomAgents("room-123", true);

      // Advance timers to trigger the setTimeout
      vi.advanceTimersByTime(10);

      // Emit the event
      manager.emit("agent_room:agents_listed", "room-123", mockAgents);

      await listPromise;

      expect(mockWsClient.sendMessage).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should handle list errors", async () => {
      const listPromise = manager.listRoomAgents("room-123");

      setTimeout(() => {
        manager.emit("agent_room:list_error", new Error("Room not found"), "room-123");
      }, 10);

      await expect(listPromise).rejects.toThrow("Room not found");
    });
  });

  describe("listAvailableAgents", () => {
    const mockAgents: AgentRoomInfo[] = [
      { agent_id: "agent-3", agent_name: "Agent 3", status: "online" },
      { agent_id: "agent-4", agent_name: "Agent 4", status: "online" }
    ];

    it("should list available agents successfully", async () => {
      const listPromise = manager.listAvailableAgents("room-123", false);

      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents);
      }, 10);

      const result = await listPromise;

      expect(result).toHaveLength(2);
      expect(result[0].agent_id).toBe("agent-3");
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "list_available_agents",
        data: {
          room_id: "room-123"
        }
      });
    });

    it("should use cached data if available", async () => {
      // Pre-populate cache
      manager.cacheAvailableAgents("room-123", mockAgents);

      const result = await manager.listAvailableAgents("room-123", true);

      expect(result).toHaveLength(2);
      expect(mockWsClient.sendMessage).not.toHaveBeenCalled();
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(manager.listAvailableAgents("room-123")).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );
    });

    it("should validate room ID", async () => {
      await expect(manager.listAvailableAgents("")).rejects.toThrow("Room ID cannot be empty");
    });
  });

  describe("Query Methods", () => {
    const mockAgents: AgentRoomInfo[] = [
      { agent_id: "agent-1", agent_name: "Agent 1" },
      { agent_id: "agent-2", agent_name: "Agent 2" }
    ];

    it("should get room agents from cache", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      const result = manager.getCachedRoomAgents("room-123");

      expect(result).toHaveLength(2);
      expect(result![0].agent_id).toBe("agent-1");
    });

    it("should return undefined if room agents not cached", () => {
      const result = manager.getCachedRoomAgents("room-999");
      expect(result).toBeUndefined();
    });

    it("should get available agents from cache", () => {
      manager.cacheAvailableAgents("room-123", mockAgents);

      const result = manager.getCachedAvailableAgents("room-123");

      expect(result).toHaveLength(2);
      expect(result![0].agent_id).toBe("agent-1");
    });

    it("should return undefined if available agents not cached", () => {
      const result = manager.getCachedAvailableAgents("room-999");
      expect(result).toBeUndefined();
    });

    it("should check if agent is in room", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      expect(manager.checkAgentInRoom("room-123", "agent-1")).toBe(true);
      expect(manager.checkAgentInRoom("room-123", "agent-999")).toBe(false);
    });

    it("should return undefined for checkAgentInRoom if not cached", () => {
      expect(manager.checkAgentInRoom("room-999", "agent-1")).toBeUndefined();
    });

    it("should get room agent count", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      expect(manager.getRoomAgentCount("room-123")).toBe(2);
    });

    it("should return undefined for count if not cached", () => {
      expect(manager.getRoomAgentCount("room-999")).toBeUndefined();
    });
  });

  describe("Cache Management", () => {
    const mockAgents: AgentRoomInfo[] = [{ agent_id: "agent-1", agent_name: "Agent 1" }];

    it("should cache room agents", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      const result = manager.getCachedRoomAgents("room-123");
      expect(result).toHaveLength(1);
      expect(result![0].agent_id).toBe("agent-1");
    });

    it("should cache available agents", () => {
      manager.cacheAvailableAgents("room-123", mockAgents);

      const result = manager.getCachedAvailableAgents("room-123");
      expect(result).toHaveLength(1);
    });

    it("should invalidate cache for specific room", () => {
      manager.cacheRoomAgents("room-123", mockAgents);
      manager.cacheAvailableAgents("room-123", mockAgents);
      manager.cacheRoomAgents("room-456", mockAgents);

      manager.invalidateCache("room-123");

      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
      expect(manager.getCachedAvailableAgents("room-123")).toBeUndefined();
      expect(manager.getCachedRoomAgents("room-456")).toBeDefined();
    });

    it("should clear all caches", () => {
      manager.cacheRoomAgents("room-123", mockAgents);
      manager.cacheRoomAgents("room-456", mockAgents);
      manager.cacheAvailableAgents("room-123", mockAgents);

      manager.clearAllCaches();

      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
      expect(manager.getCachedRoomAgents("room-456")).toBeUndefined();
      expect(manager.getCachedAvailableAgents("room-123")).toBeUndefined();
    });
  });

  describe("Status Updates", () => {
    const mockAgents: AgentRoomInfo[] = [
      { agent_id: "agent-1", agent_name: "Agent 1", status: "online" }
    ];

    it("should handle status updates and invalidate cache", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      expect(manager.getCachedRoomAgents("room-123")).toBeDefined();

      manager.handleStatusUpdate("room-123", "agent-1", "offline");

      // Cache should be invalidated
      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
    });

    it("should not invalidate other room caches on status update", () => {
      manager.cacheRoomAgents("room-123", mockAgents);
      manager.cacheRoomAgents("room-456", mockAgents);

      manager.handleStatusUpdate("room-123", "agent-1", "offline");

      expect(manager.getCachedRoomAgents("room-123")).toBeUndefined();
      expect(manager.getCachedRoomAgents("room-456")).toBeDefined();
    });
  });

  describe("listAvailableAgents with pagination", () => {
    const mockAgents: AgentRoomInfo[] = [
      { agent_id: "agent-3", agent_name: "Agent 3", status: "online" },
      { agent_id: "agent-4", agent_name: "Agent 4", status: "online" }
    ];

    it("should send pagination params in the message data", async () => {
      const listPromise = manager.listAvailableAgents("room-123", {
        limit: 20,
        offset: 10,
        sortBy: "a-z"
      });

      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents, {
          total: 100,
          offset: 10,
          limit: 20,
          hasMore: true
        });
      }, 10);

      await listPromise;

      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "list_available_agents",
        data: {
          room_id: "room-123",
          limit: 20,
          offset: 10,
          sort_by: "a-z"
        }
      });
    });

    it("should return PaginatedAgentsResult when called with options", async () => {
      const listPromise = manager.listAvailableAgents("room-123", {
        limit: 20,
        offset: 10
      });

      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents, {
          total: 100,
          offset: 10,
          limit: 20,
          hasMore: true
        });
      }, 10);

      const result = await listPromise;

      expect(result).toEqual({
        agents: mockAgents,
        total: 100,
        offset: 10,
        limit: 20,
        hasMore: true
      } satisfies PaginatedAgentsResult);
    });

    it("should not use cache when called with options object", async () => {
      // Pre-populate cache
      manager.cacheAvailableAgents("room-123", mockAgents);

      // Verify cache has data
      expect(manager.getCachedAvailableAgents("room-123")).toHaveLength(2);

      const listPromise = manager.listAvailableAgents("room-123", { limit: 10 });

      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents, {
          total: 2,
          offset: 0,
          limit: 10,
          hasMore: false
        });
      }, 10);

      await listPromise;

      // Should have sent a message to the server despite cache existing
      expect(mockWsClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "list_available_agents" })
      );
    });

    it("should send all option fields with correct snake_case mapping", async () => {
      const listPromise = manager.listAvailableAgents("room-123", {
        limit: 50,
        offset: 0,
        includeDetails: true,
        minimal: false,
        sortBy: "requests",
        includeInRoom: true
      });

      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents, {
          total: 2,
          offset: 0,
          limit: 50,
          hasMore: false
        });
      }, 10);

      await listPromise;

      expect(mockWsClient.sendMessage).toHaveBeenCalledWith({
        type: "list_available_agents",
        data: {
          room_id: "room-123",
          limit: 50,
          offset: 0,
          include_details: true,
          minimal: false,
          sort_by: "requests",
          include_in_room: true
        }
      });
    });

    it("should maintain backward compatibility with boolean useCache parameter", async () => {
      const listPromise = manager.listAvailableAgents("room-123", true);

      // Pre-populate cache is not set, so it will send a message
      // But if we set cache first and call with true, it should use cache
      manager.cacheAvailableAgents("room-123", mockAgents);

      const cachedResult = await manager.listAvailableAgents("room-123", true);

      // Should return AgentRoomInfo[] (not PaginatedAgentsResult)
      expect(Array.isArray(cachedResult)).toBe(true);
      expect(cachedResult).toHaveLength(2);
      expect((cachedResult as AgentRoomInfo[])[0].agent_id).toBe("agent-3");

      // The first call (no cache) should have triggered sendMessage
      setTimeout(() => {
        manager.emit("agent_room:available_agents_listed", mockAgents);
      }, 10);

      const result = await listPromise;

      // Legacy call returns AgentRoomInfo[], not PaginatedAgentsResult
      expect(Array.isArray(result)).toBe(true);
      expect((result as AgentRoomInfo[])).toHaveLength(2);
      // Should NOT have 'total', 'offset', 'limit', 'hasMore' properties
      expect(result).not.toHaveProperty("total");
      expect(result).not.toHaveProperty("hasMore");
    });
  });

  describe("Return Value Immutability", () => {
    const mockAgents: AgentRoomInfo[] = [{ agent_id: "agent-1", agent_name: "Agent 1" }];

    it("should return defensive copies from getCachedRoomAgents", () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      const agents1 = manager.getCachedRoomAgents("room-123");
      const agents2 = manager.getCachedRoomAgents("room-123");

      expect(agents1).not.toBe(agents2);
      expect(agents1![0]).not.toBe(agents2![0]);
    });

    it("should return defensive copies from getCachedAvailableAgents", () => {
      manager.cacheAvailableAgents("room-123", mockAgents);

      const agents1 = manager.getCachedAvailableAgents("room-123");
      const agents2 = manager.getCachedAvailableAgents("room-123");

      expect(agents1).not.toBe(agents2);
      expect(agents1![0]).not.toBe(agents2![0]);
    });

    it("should return defensive copies from listRoomAgents", async () => {
      manager.cacheRoomAgents("room-123", mockAgents);

      const result1 = await manager.listRoomAgents("room-123", true);
      const result2 = await manager.listRoomAgents("room-123", true);

      expect(result1).not.toBe(result2);
      expect(result1[0]).not.toBe(result2[0]);
    });
  });
});
