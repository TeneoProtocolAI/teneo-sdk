/**
 * RoomManagementManager - Manages room CRUD operations (v2.0.0)
 * Handles creating, updating, and deleting private rooms
 * Tracks owned vs shared rooms with local caching
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { RoomInfo, Logger } from "../types";
import { SDKEvents, SDKError } from "../types/events";
import { ErrorCode } from "../types/error-codes";

export interface CreateRoomOptions {
  name: string;
  description?: string;
}

export interface UpdateRoomOptions {
  name?: string;
  description?: string;
}

export class RoomManagementManager extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;

  // Room caches
  private readonly ownedRooms = new Map<string, RoomInfo>(); // Rooms user owns
  private readonly sharedRooms = new Map<string, RoomInfo>(); // Rooms user is member of
  private maxPrivateRooms: number = 1; // Default limit

  constructor(wsClient: WebSocketClient, logger: Logger) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
  }

  // ============================================================================
  // ROOM CRUD OPERATIONS
  // ============================================================================

  /**
   * Creates a new private room.
   * Checks room limit before creating.
   *
   * @param options - Room creation options
   * @returns Promise that resolves when room is created
   * @throws {SDKError} If not connected, over limit, or validation fails
   *
   * @example
   * ```typescript
   * const room = await sdk.rooms.createRoom({
   *   name: 'My Private Room',
   *   description: 'A room for my project'
   * });
   * console.log(`Created room: ${room.id}`);
   * ```
   */
  public async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    // Validate inputs
    this.validateRoomName(options.name);
    if (options.description !== undefined) {
      this.validateRoomDescription(options.description);
    }

    // Check room limit
    if (!this.canCreateRoom()) {
      throw new SDKError(
        `Room limit reached. Maximum ${this.maxPrivateRooms} private rooms allowed.`,
        ErrorCode.VALIDATION_ERROR
      );
    }

    this.logger.debug("RoomManagementManager: Creating room", options);

    // Send create_room message
    const message = {
      type: "create_room" as const,
      data: {
        name: options.name,
        description: options.description
      }
    };

    // Return promise that will be resolved by the response handler
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Room creation timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (room: RoomInfo) => {
        cleanup();
        resolve(room);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("room:created", onSuccess);
        this.off("room:create_error", onError);
      };

      this.once("room:created", onSuccess);
      this.once("room:create_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  /**
   * Updates an existing room's name and/or description.
   * User must own the room to update it.
   *
   * @param roomId - ID of room to update
   * @param updates - Fields to update
   * @returns Promise that resolves when room is updated
   * @throws {SDKError} If not connected, not owner, or validation fails
   *
   * @example
   * ```typescript
   * await sdk.rooms.updateRoom('room-123', {
   *   name: 'Updated Room Name',
   *   description: 'New description'
   * });
   * ```
   */
  public async updateRoom(roomId: string, updates: UpdateRoomOptions): Promise<RoomInfo> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    // Verify user owns room
    if (!this.ownedRooms.has(roomId)) {
      throw new SDKError(
        "Cannot update room: You don't own this room",
        ErrorCode.PERMISSION_DENIED
      );
    }

    // Validate at least one field is provided
    if (updates.name === undefined && updates.description === undefined) {
      throw new SDKError(
        "At least one field (name or description) must be provided",
        ErrorCode.VALIDATION_ERROR
      );
    }

    // Validate inputs
    if (updates.name !== undefined) {
      this.validateRoomName(updates.name);
    }
    if (updates.description !== undefined) {
      this.validateRoomDescription(updates.description);
    }

    this.logger.debug("RoomManagementManager: Updating room", { roomId, updates });

    // Send update_room message
    const message = {
      type: "update_room" as const,
      data: {
        room_id: roomId,
        name: updates.name,
        description: updates.description
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Room update timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (room: RoomInfo) => {
        // Only resolve if it's the room we're updating
        if (room.id === roomId) {
          cleanup();
          resolve(room);
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
        this.off("room:updated", onSuccess);
        this.off("room:update_error", onError);
      };

      this.once("room:updated", onSuccess);
      this.once("room:update_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  /**
   * Deletes a room permanently.
   * User must own the room to delete it.
   *
   * @param roomId - ID of room to delete
   * @returns Promise that resolves when room is deleted
   * @throws {SDKError} If not connected or not owner
   *
   * @example
   * ```typescript
   * await sdk.rooms.deleteRoom('room-123');
   * console.log('Room deleted successfully');
   * ```
   */
  public async deleteRoom(roomId: string): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    // Verify user owns room
    if (!this.ownedRooms.has(roomId)) {
      throw new SDKError(
        "Cannot delete room: You don't own this room",
        ErrorCode.PERMISSION_DENIED
      );
    }

    this.logger.debug("RoomManagementManager: Deleting room", { roomId });

    // Send delete_room message
    const message = {
      type: "delete_room" as const,
      data: {
        room_id: roomId
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Room deletion timeout", ErrorCode.TIMEOUT));
      }, 30000);

      const onSuccess = (deletedRoomId: string) => {
        if (deletedRoomId === roomId) {
          cleanup();
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
        this.off("room:deleted", onSuccess);
        this.off("room:delete_error", onError);
      };

      this.once("room:deleted", onSuccess);
      this.once("room:delete_error", onError);

      this.wsClient.sendMessage(message);
    });
  }

  // ============================================================================
  // QUERY METHODS (Synchronous, from cache)
  // ============================================================================

  /**
   * Gets all rooms owned by the current user.
   * Synchronous method that returns cached data.
   *
   * @returns Array of owned room info
   *
   * @example
   * ```typescript
   * const myRooms = sdk.rooms.getOwnedRooms();
   * console.log(`I own ${myRooms.length} rooms`);
   * ```
   */
  public getOwnedRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return Array.from(this.ownedRooms.values()).map((room) => ({ ...room }));
  }

  /**
   * Gets all rooms the user is a member of (but doesn't own).
   * Synchronous method that returns cached data.
   *
   * @returns Array of shared room info
   *
   * @example
   * ```typescript
   * const sharedRooms = sdk.rooms.getSharedRooms();
   * console.log(`I'm a member of ${sharedRooms.length} shared rooms`);
   * ```
   */
  public getSharedRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return Array.from(this.sharedRooms.values()).map((room) => ({ ...room }));
  }

  /**
   * Gets all rooms the user has access to (both owned and shared).
   * Convenience method that combines getOwnedRooms() and getSharedRooms().
   * Synchronous method that returns cached data.
   *
   * @returns Array of all room info (owned + shared)
   *
   * @example
   * ```typescript
   * const allRooms = sdk.getAllRooms();
   * console.log(`I have access to ${allRooms.length} total rooms`);
   *
   * // Filter by ownership if needed
   * const myRooms = allRooms.filter(r => r.is_owner);
   * const sharedWithMe = allRooms.filter(r => !r.is_owner);
   * ```
   */
  public getAllRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return [...this.getOwnedRooms(), ...this.getSharedRooms()];
  }

  /**
   * Gets a specific room by ID.
   * Checks both owned and shared room caches.
   *
   * @param roomId - Room ID to look up
   * @returns Room info if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const room = sdk.rooms.getRoomById('room-123');
   * if (room) {
   *   console.log(`Room: ${room.name}`);
   * }
   * ```
   */
  public getRoomById(roomId: string): Readonly<RoomInfo> | undefined {
    const owned = this.ownedRooms.get(roomId);
    if (owned) return { ...owned };

    const shared = this.sharedRooms.get(roomId);
    if (shared) return { ...shared };

    return undefined;
  }

  /**
   * Gets the maximum number of private rooms the user can create.
   * Based on user's subscription/plan.
   *
   * @returns Maximum private room limit
   *
   * @example
   * ```typescript
   * const limit = sdk.rooms.getRoomLimit();
   * console.log(`You can create up to ${limit} private rooms`);
   * ```
   */
  public getRoomLimit(): number {
    return this.maxPrivateRooms;
  }

  /**
   * Checks if user can create another private room.
   * Compares current owned room count against limit.
   *
   * @returns True if under limit, false otherwise
   *
   * @example
   * ```typescript
   * if (sdk.rooms.canCreateRoom()) {
   *   await sdk.rooms.createRoom({ name: 'New Room' });
   * } else {
   *   console.log('Room limit reached!');
   * }
   * ```
   */
  public canCreateRoom(): boolean {
    return this.ownedRooms.size < this.maxPrivateRooms;
  }

  /**
   * Gets the current count of owned private rooms.
   *
   * @returns Number of rooms user owns
   *
   * @example
   * ```typescript
   * const count = sdk.rooms.getOwnedRoomCount();
   * const limit = sdk.rooms.getRoomLimit();
   * console.log(`Using ${count}/${limit} room slots`);
   * ```
   */
  public getOwnedRoomCount(): number {
    return this.ownedRooms.size;
  }

  // ============================================================================
  // INTERNAL METHODS (Called by SDK internals)
  // ============================================================================

  /**
   * Sets the room limit from auth response.
   * @internal
   */
  public setRoomLimit(limit: number): void {
    this.maxPrivateRooms = limit;
    this.logger.debug("RoomManagementManager: Room limit set", { limit });
  }

  /**
   * Initializes owned rooms cache from auth response.
   * @internal
   */
  public setOwnedRooms(rooms: RoomInfo[]): void {
    this.ownedRooms.clear();
    for (const room of rooms) {
      this.ownedRooms.set(room.id, room);
    }
    this.logger.debug("RoomManagementManager: Owned rooms set", { count: rooms.length });
  }

  /**
   * Initializes shared rooms cache from auth response.
   * @internal
   */
  public setSharedRooms(rooms: RoomInfo[]): void {
    this.sharedRooms.clear();
    for (const room of rooms) {
      this.sharedRooms.set(room.id, room);
    }
    this.logger.debug("RoomManagementManager: Shared rooms set", { count: rooms.length });
  }

  /**
   * Adds or updates a room in the appropriate cache.
   * Determines owned vs shared based on is_owner flag.
   * @internal
   */
  public upsertRoom(room: RoomInfo): void {
    if (room.is_owner) {
      this.ownedRooms.set(room.id, room);
      // Remove from shared if it was there
      this.sharedRooms.delete(room.id);
      this.logger.debug("RoomManagementManager: Upserted owned room", { roomId: room.id });
    } else {
      this.sharedRooms.set(room.id, room);
      // Remove from owned if it was there
      this.ownedRooms.delete(room.id);
      this.logger.debug("RoomManagementManager: Upserted shared room", { roomId: room.id });
    }
  }

  /**
   * Removes a room from cache.
   * Checks both owned and shared caches.
   * @internal
   */
  public removeRoom(roomId: string): void {
    const wasOwned = this.ownedRooms.delete(roomId);
    const wasShared = this.sharedRooms.delete(roomId);

    if (wasOwned || wasShared) {
      this.logger.debug("RoomManagementManager: Removed room", {
        roomId,
        wasOwned,
        wasShared
      });
    }
  }

  /**
   * Clears all caches. Called on disconnect.
   * @internal
   */
  public clearCaches(): void {
    this.ownedRooms.clear();
    this.sharedRooms.clear();
    this.maxPrivateRooms = 1;
    this.logger.debug("RoomManagementManager: Caches cleared");
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  private validateRoomName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new SDKError("Room name cannot be empty", ErrorCode.VALIDATION_ERROR);
    }
    if (name.length > 100) {
      throw new SDKError("Room name too long (max 100 characters)", ErrorCode.VALIDATION_ERROR);
    }
  }

  private validateRoomDescription(description: string): void {
    if (description.length > 500) {
      throw new SDKError(
        "Room description too long (max 500 characters)",
        ErrorCode.VALIDATION_ERROR
      );
    }
  }
}
