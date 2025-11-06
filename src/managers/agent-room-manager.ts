/**
 * AgentRoomManager - Manages agent-room associations (v2.0.0)
 * Allows room owners to control which agents are available in their rooms
 * Implements caching with 5-minute TTL for performance
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { Logger } from "../types";
import { SDKEvents, SDKError } from "../types/events";
import { ErrorCode } from "../types/error-codes";
import { RoomManagementManager } from "./room-management-manager";

// AgentRoomInfo from server response
export interface AgentRoomInfo {
  agent_id: string;
  agent_name?: string;
  description?: string;
  capabilities?: Array<{ name: string; description?: string }>;
  commands?: Array<{ trigger: string; argument?: string; description?: string }>;
  image?: string;
  status?: string;
  added_by?: string;
  added_at?: string;
}

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

export class AgentRoomManager extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;
  private readonly roomManagementManager: RoomManagementManager; // Reference to check ownership

  // Caches with TTL
  private readonly roomAgentsCache = new Map<string, AgentRoomInfo[]>();
  private readonly availableAgentsCache = new Map<string, AgentRoomInfo[]>();
  private readonly roomAgentsCacheTime = new Map<string, number>();
  private readonly availableAgentsCacheTime = new Map<string, number>();

  constructor(
    wsClient: WebSocketClient,
    logger: Logger,
    roomManagementManager: RoomManagementManager
  ) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
    this.roomManagementManager = roomManagementManager;
  }

  // ============================================================================
  // AGENT ROOM OPERATIONS
  // ============================================================================

  /**
   * Adds an agent to a room, making it available for interactions in that room.
   * User must own the room to perform this operation.
   *
   * @param roomId - ID of the room to add agent to
   * @param agentId - ID of the agent to add
   * @returns Promise that resolves when agent is added
   * @throws {SDKError} If not connected, not room owner, or operation fails
   *
   * @example
   * ```typescript
   * await sdk.addAgentToRoom('room-123', 'agent-456');
   * console.log('Agent added to room');
   * ```
   */
  public async addAgentToRoom(roomId: string, agentId: string): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate inputs
    this.validateRoomId(roomId);
    this.validateAgentId(agentId);

    // Verify room exists
    if (!this.roomExists(roomId)) {
      throw new SDKError("Room not found", ErrorCode.VALIDATION_ERROR);
    }

    // Verify user owns room
    if (!this.verifyOwnership(roomId)) {
      throw new SDKError(
        "Cannot add agent to room: You don't own this room",
        ErrorCode.PERMISSION_DENIED
      );
    }

    this.logger.debug("AgentRoomManager: Adding agent to room", { roomId, agentId });

    const message = {
      type: "add_agent_to_room" as const,
      data: {
        room_id: roomId,
        agent_id: agentId
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Add agent to room timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (responseRoomId: string, responseAgentId: string) => {
        if (responseRoomId === roomId && responseAgentId === agentId) {
          cleanup();
          // Invalidate caches for this room
          this.invalidateRoomCaches(roomId);
          resolve();
        }
      };

      const onError = (error: Error, responseRoomId?: string) => {
        if (!responseRoomId || responseRoomId === roomId) {
          cleanup();
          reject(error);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("agent_room:agent_added", onSuccess);
        this.off("agent_room:add_error", onError);
      };

      this.once("agent_room:agent_added", onSuccess);
      this.once("agent_room:add_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  /**
   * Removes an agent from a room.
   * User must own the room to perform this operation.
   *
   * @param roomId - ID of the room to remove agent from
   * @param agentId - ID of the agent to remove
   * @returns Promise that resolves when agent is removed
   * @throws {SDKError} If not connected, not room owner, or operation fails
   *
   * @example
   * ```typescript
   * await sdk.removeAgentFromRoom('room-123', 'agent-456');
   * console.log('Agent removed from room');
   * ```
   */
  public async removeAgentFromRoom(roomId: string, agentId: string): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate inputs
    this.validateRoomId(roomId);
    this.validateAgentId(agentId);

    // Verify user owns room
    if (!this.verifyOwnership(roomId)) {
      throw new SDKError(
        "Cannot remove agent from room: You don't own this room",
        ErrorCode.PERMISSION_DENIED
      );
    }

    this.logger.debug("AgentRoomManager: Removing agent from room", { roomId, agentId });

    const message = {
      type: "remove_agent_from_room" as const,
      data: {
        room_id: roomId,
        agent_id: agentId
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Remove agent from room timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (responseRoomId: string, responseAgentId: string) => {
        if (responseRoomId === roomId && responseAgentId === agentId) {
          cleanup();
          // Invalidate caches for this room
          this.invalidateRoomCaches(roomId);
          resolve();
        }
      };

      const onError = (error: Error, responseRoomId?: string) => {
        if (!responseRoomId || responseRoomId === roomId) {
          cleanup();
          reject(error);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("agent_room:agent_removed", onSuccess);
        this.off("agent_room:remove_error", onError);
      };

      this.once("agent_room:agent_removed", onSuccess);
      this.once("agent_room:remove_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  /**
   * Lists all agents currently in a room.
   * Results are cached for 5 minutes for performance.
   *
   * @param roomId - ID of the room to list agents for
   * @param useCache - Whether to use cached data (default: true)
   * @returns Promise that resolves with array of agents
   * @throws {SDKError} If not connected or operation fails
   *
   * @example
   * ```typescript
   * const agents = await sdk.listRoomAgents('room-123');
   * console.log(`Room has ${agents.length} agents`);
   *
   * // Force fresh data
   * const freshAgents = await sdk.listRoomAgents('room-123', false);
   * ```
   */
  public async listRoomAgents(
    roomId: string,
    useCache: boolean = true
  ): Promise<AgentRoomInfo[]> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate input
    this.validateRoomId(roomId);

    // Check cache if enabled
    if (useCache && this.isCacheValid(this.roomAgentsCacheTime, roomId)) {
      const cached = this.roomAgentsCache.get(roomId);
      if (cached) {
        this.logger.debug("AgentRoomManager: Returning cached room agents", {
          roomId,
          count: cached.length
        });
        return cached.map((agent) => ({ ...agent })); // Return deep copy
      }
    }

    this.logger.debug("AgentRoomManager: Listing room agents", { roomId });

    const message = {
      type: "list_room_agents" as const,
      data: {
        room_id: roomId
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("List room agents timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (responseRoomId: string, agents: AgentRoomInfo[]) => {
        if (responseRoomId === roomId) {
          cleanup();
          resolve(agents);
        }
      };

      const onError = (error: Error, responseRoomId?: string) => {
        if (!responseRoomId || responseRoomId === roomId) {
          cleanup();
          reject(error);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("agent_room:agents_listed", onSuccess);
        this.off("agent_room:list_error", onError);
      };

      this.once("agent_room:agents_listed", onSuccess);
      this.once("agent_room:list_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  /**
   * Lists all agents available to add to a room (not yet in the room).
   * Results are cached for 5 minutes for performance.
   *
   * @param roomId - ID of the room to check available agents for
   * @param useCache - Whether to use cached data (default: true)
   * @returns Promise that resolves with array of available agents
   * @throws {SDKError} If not connected or operation fails
   *
   * @example
   * ```typescript
   * const availableAgents = await sdk.listAvailableAgents('room-123');
   * console.log(`${availableAgents.length} agents can be added`);
   * ```
   */
  public async listAvailableAgents(
    roomId: string,
    useCache: boolean = true
  ): Promise<AgentRoomInfo[]> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate input
    this.validateRoomId(roomId);

    // Check cache if enabled
    if (useCache && this.isCacheValid(this.availableAgentsCacheTime, roomId)) {
      const cached = this.availableAgentsCache.get(roomId);
      if (cached) {
        this.logger.debug("AgentRoomManager: Returning cached available agents", {
          roomId,
          count: cached.length
        });
        return cached.map((agent) => ({ ...agent })); // Return deep copy
      }
    }

    this.logger.debug("AgentRoomManager: Listing available agents", { roomId });

    const message = {
      type: "list_available_agents" as const,
      data: {
        room_id: roomId
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("List available agents timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (agents: AgentRoomInfo[]) => {
        cleanup();
        resolve(agents);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("agent_room:available_agents_listed", onSuccess);
        this.off("agent_room:list_available_error", onError);
      };

      this.once("agent_room:available_agents_listed", onSuccess);
      this.once("agent_room:list_available_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  // ============================================================================
  // QUERY METHODS (Synchronous, from cache)
  // ============================================================================

  /**
   * Gets agents currently in a room from cache (synchronous).
   * Returns undefined if not cached or cache expired.
   *
   * @param roomId - Room ID to query
   * @returns Array of agents or undefined if not cached
   *
   * @example
   * ```typescript
   * const agents = sdk.getRoomAgents('room-123');
   * if (agents) {
   *   console.log(`Found ${agents.length} agents in cache`);
   * }
   * ```
   */
  public getRoomAgents(roomId: string): AgentRoomInfo[] | undefined {
    if (!this.isCacheValid(this.roomAgentsCacheTime, roomId)) {
      return undefined;
    }
    const cached = this.roomAgentsCache.get(roomId);
    return cached ? cached.map((agent) => ({ ...agent })) : undefined;
  }

  /**
   * Gets available agents for a room from cache (synchronous).
   * Returns undefined if not cached or cache expired.
   *
   * @param roomId - Room ID to query
   * @returns Array of available agents or undefined if not cached
   *
   * @example
   * ```typescript
   * const available = sdk.getAvailableAgents('room-123');
   * if (available) {
   *   console.log(`${available.length} agents can be added`);
   * }
   * ```
   */
  public getAvailableAgents(roomId: string): AgentRoomInfo[] | undefined {
    if (!this.isCacheValid(this.availableAgentsCacheTime, roomId)) {
      return undefined;
    }
    const cached = this.availableAgentsCache.get(roomId);
    return cached ? cached.map((agent) => ({ ...agent })) : undefined;
  }

  /**
   * Checks if an agent is currently in a room (from cache).
   * Returns undefined if cache is invalid.
   *
   * @param roomId - Room ID to check
   * @param agentId - Agent ID to check
   * @returns True if agent in room, false if not, undefined if cache invalid
   *
   * @example
   * ```typescript
   * const isInRoom = sdk.isAgentInRoom('room-123', 'agent-456');
   * if (isInRoom === true) {
   *   console.log('Agent is in this room');
   * }
   * ```
   */
  public isAgentInRoom(roomId: string, agentId: string): boolean | undefined {
    const agents = this.getRoomAgents(roomId);
    if (!agents) return undefined;
    return agents.some((agent) => agent.agent_id === agentId);
  }

  /**
   * Gets the count of agents in a room (from cache).
   * Returns undefined if cache is invalid.
   *
   * @param roomId - Room ID to count agents for
   * @returns Number of agents or undefined if cache invalid
   *
   * @example
   * ```typescript
   * const count = sdk.getRoomAgentCount('room-123');
   * if (count !== undefined) {
   *   console.log(`Room has ${count} agents`);
   * }
   * ```
   */
  public getRoomAgentCount(roomId: string): number | undefined {
    const agents = this.getRoomAgents(roomId);
    return agents ? agents.length : undefined;
  }

  // ============================================================================
  // CACHE MANAGEMENT (Public methods)
  // ============================================================================

  /**
   * Manually invalidates all caches for a specific room.
   * Useful after operations that might have changed agent assignments.
   *
   * @param roomId - Room ID to invalidate cache for
   *
   * @example
   * ```typescript
   * // After bulk operations
   * sdk.invalidateCache('room-123');
   * const freshAgents = await sdk.listRoomAgents('room-123', false);
   * ```
   */
  public invalidateCache(roomId: string): void {
    this.invalidateRoomCaches(roomId);
    this.logger.debug("AgentRoomManager: Cache invalidated", { roomId });
  }

  /**
   * Clears all caches for all rooms.
   * Called automatically on disconnect.
   * @internal
   */
  public clearAllCaches(): void {
    this.roomAgentsCache.clear();
    this.availableAgentsCache.clear();
    this.roomAgentsCacheTime.clear();
    this.availableAgentsCacheTime.clear();
    this.logger.debug("AgentRoomManager: All caches cleared");
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  /**
   * Handles agent status updates from server.
   * Invalidates cache when agent status changes.
   * @internal
   */
  public handleStatusUpdate(roomId: string, agentId: string, status: string): void {
    this.logger.debug("AgentRoomManager: Agent status update", {
      roomId,
      agentId,
      status
    });

    // Invalidate cache for this room as agent list may have changed
    this.invalidateRoomCaches(roomId);
  }

  /**
   * Called by handlers to cache room agents.
   * @internal
   */
  public cacheRoomAgents(roomId: string, agents: AgentRoomInfo[]): void {
    this.roomAgentsCache.set(roomId, agents);
    this.roomAgentsCacheTime.set(roomId, Date.now());
    this.logger.debug("AgentRoomManager: Cached room agents", {
      roomId,
      count: agents.length
    });
  }

  /**
   * Called by handlers to cache available agents.
   * @internal
   */
  public cacheAvailableAgents(roomId: string, agents: AgentRoomInfo[]): void {
    this.availableAgentsCache.set(roomId, agents);
    this.availableAgentsCacheTime.set(roomId, Date.now());
    this.logger.debug("AgentRoomManager: Cached available agents", {
      roomId,
      count: agents.length
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Checks if cache is still valid (within TTL)
   */
  private isCacheValid(cacheTimeMap: Map<string, number>, roomId: string): boolean {
    const cacheTime = cacheTimeMap.get(roomId);
    if (!cacheTime) return false;

    const age = Date.now() - cacheTime;
    return age < CACHE_TTL_MS;
  }

  /**
   * Invalidates all caches for a specific room
   */
  private invalidateRoomCaches(roomId: string): void {
    this.roomAgentsCache.delete(roomId);
    this.availableAgentsCache.delete(roomId);
    this.roomAgentsCacheTime.delete(roomId);
    this.availableAgentsCacheTime.delete(roomId);
  }

  /**
   * Verifies user owns the room
   */
  private validateRoomId(roomId: string): void {
    if (!roomId || roomId.trim() === "") {
      throw new SDKError("Room ID cannot be empty", ErrorCode.VALIDATION_ERROR);
    }
  }

  private validateAgentId(agentId: string): void {
    if (!agentId || agentId.trim() === "") {
      throw new SDKError("Agent ID cannot be empty", ErrorCode.VALIDATION_ERROR);
    }
  }

  private roomExists(roomId: string): boolean {
    if (!this.roomManagementManager) return true; // Skip check if manager not available

    // If getRoomById method doesn't exist, skip check
    if (typeof this.roomManagementManager.getRoomById !== "function") {
      return true;
    }

    // Check if room exists (in owned or shared rooms)
    const room = this.roomManagementManager.getRoomById(roomId);
    return room !== undefined;
  }

  private verifyOwnership(roomId: string): boolean {
    if (!this.roomManagementManager) return true; // Skip check if manager not available

    // Check if room is in owned rooms
    const ownedRooms = this.roomManagementManager.getOwnedRooms?.();
    if (!ownedRooms) return true; // Skip check if method not available

    return ownedRooms.some((room: any) => room.id === roomId);
  }
}
