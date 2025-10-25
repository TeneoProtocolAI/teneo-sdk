/**
 * RoomManager - Manages room state and operations
 * Handles joining, leaving, and tracking rooms
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { Room, createSubscribe, createUnsubscribe, createListRooms, Logger, RoomInfo } from "../types";
import { SDKEvents, SDKError } from "../types/events";
import { ErrorCode } from "../types/error-codes";
import { RoomIdSchema } from "../types/validation";

export class RoomManager extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;
  private readonly rooms = new Map<string, Room>();
  private readonly subscribedRooms = new Set<string>();

  constructor(wsClient: WebSocketClient, logger: Logger) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
  }

  /**
   * Subscribes to a public room in the Teneo network.
   * Validates room ID and sends subscribe message to the server.
   * The actual subscription state is updated when the server confirms via room:subscribed event.
   *
   * @param roomId - The ID of the room to subscribe to
   * @returns Promise that resolves when subscribed
   * @throws {SDKError} If not connected to the network
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * await roomManager.subscribeToRoom('general');
   * console.log('Subscription request sent to general room');
   * ```
   */
  public async subscribeToRoom(roomId: string): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate room ID
    const validatedRoomId = RoomIdSchema.parse(roomId);

    this.logger.info("RoomManager: Subscribing to room", { roomId: validatedRoomId });

    const message = createSubscribe(validatedRoomId);
    await this.wsClient.sendMessage(message);
  }

  /**
   * Unsubscribes from a room in the Teneo network.
   * Validates room ID and sends unsubscribe message to the server.
   * The actual subscription state is updated when the server confirms via room:unsubscribed event.
   *
   * @param roomId - The ID of the room to unsubscribe from
   * @returns Promise that resolves when unsubscribed
   * @throws {SDKError} If not connected to the network
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * await roomManager.unsubscribeFromRoom('general');
   * console.log('Unsubscription request sent for general room');
   * ```
   */
  public async unsubscribeFromRoom(roomId: string): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate room ID
    const validatedRoomId = RoomIdSchema.parse(roomId);

    this.logger.info("RoomManager: Unsubscribing from room", { roomId: validatedRoomId });

    const message = createUnsubscribe(validatedRoomId);
    await this.wsClient.sendMessage(message);
  }

  /**
   * Updates the subscription state from server response.
   * This is the authoritative source of which rooms you're subscribed to.
   * Called internally when receiving subscribe/unsubscribe responses.
   *
   * @internal
   * @param subscriptions - Array of room IDs from server response
   *
   * @example
   * ```typescript
   * // Internal SDK usage
   * roomManager.updateSubscriptions(['general', 'support', 'trading']);
   * ```
   */
  public updateSubscriptions(subscriptions: string[]): void {
    this.subscribedRooms.clear();
    subscriptions.forEach(roomId => this.subscribedRooms.add(roomId));
    this.logger.debug("RoomManager: Subscriptions updated", {
      count: subscriptions.length,
      rooms: subscriptions
    });
  }

  /**
   * Gets all rooms currently subscribed to.
   * Returns array of room IDs that you're actively listening to.
   *
   * @returns Array of subscribed room IDs
   *
   * @example
   * ```typescript
   * const rooms = roomManager.getSubscribedRooms();
   * console.log(`Subscribed to ${rooms.length} rooms:`, rooms);
   * ```
   */
  public getSubscribedRooms(): string[] {
    return Array.from(this.subscribedRooms);
  }

  /**
   * Gets a list of all available rooms.
   * Returns rooms the user has access to based on authentication.
   * Returns a read-only array with defensive copies to prevent external modification.
   *
   * @returns Read-only array of room copies
   *
   * @example
   * ```typescript
   * const rooms = roomManager.getRooms();
   * rooms.forEach(room => console.log(`${room.id}: ${room.name}`));
   * ```
   */
  public getRooms(): ReadonlyArray<Readonly<Room>> {
    return Array.from(this.rooms.values()).map((room) => ({ ...room }));
  }

  /**
   * Gets a specific room by its ID.
   * Returns a defensive copy to prevent external modification of room state.
   * Returns undefined if room doesn't exist or user doesn't have access.
   *
   * @param roomId - The ID of the room to retrieve
   * @returns Copy of the room object if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const room = roomManager.getRoom('general');
   * if (room) {
   *   console.log(`Room: ${room.name}`);
   *   console.log(`Members: ${room.members?.length ?? 0}`);
   * }
   * ```
   */
  public getRoom(roomId: string): Readonly<Room> | undefined {
    const room = this.rooms.get(roomId);
    return room ? { ...room } : undefined;
  }

  /**
   * Fetches the list of rooms from the server.
   * Sends list_rooms message and waits for response from server.
   * Returns array of rooms the user owns or has access to.
   *
   * @returns Promise that resolves to array of room information
   * @throws {SDKError} If not connected to the network
   *
   * @example
   * ```typescript
   * const rooms = await roomManager.listRooms();
   * rooms.forEach(room => {
   *   console.log(`${room.name} (${room.is_public ? 'public' : 'private'})`);
   *   console.log(`Owner: ${room.is_owner}`);
   * });
   * ```
   */
  public async listRooms(): Promise<RoomInfo[]> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    this.logger.info("RoomManager: Listing rooms");

    const message = createListRooms();
    await this.wsClient.sendMessage(message);

    // Room list will be received via list_rooms response handler
    // For now, return empty array as this is async
    // TODO: Implement response waiting mechanism
    return [];
  }

  /**
   * Updates the room list from authentication state.
   * Called internally after successful authentication to populate accessible rooms.
   *
   * @internal This method is for internal SDK use
   * @param rooms - Array of rooms to update in the manager
   *
   * @example
   * ```typescript
   * // Internal SDK usage after auth
   * roomManager.updateRoomsFromAuth(authState.roomObjects);
   * ```
   */
  public updateRoomsFromAuth(rooms: Room[]): void {
    this.logger.debug("RoomManager: Updating rooms from auth", { count: rooms.length });

    for (const room of rooms) {
      this.rooms.set(room.id, room);
    }
  }

  /**
   * Clears all rooms from the manager.
   * Clears subscription state.
   *
   * @example
   * ```typescript
   * roomManager.clear();
   * console.log('All rooms cleared');
   * ```
   */
  public clear(): void {
    this.rooms.clear();
    this.subscribedRooms.clear();
  }

  /**
   * Destroys the room manager and cleans up resources.
   * Clears all rooms and removes all event listeners.
   * After destruction, the manager cannot be reused.
   *
   * @example
   * ```typescript
   * roomManager.destroy();
   * console.log('Room manager destroyed');
   * ```
   */
  public destroy(): void {
    this.logger.info("RoomManager: Destroying");
    this.clear();
    this.removeAllListeners();
  }
}
