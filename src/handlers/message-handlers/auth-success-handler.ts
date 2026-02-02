/**
 * Handler for auth_success messages
 * Legacy support for explicit auth_success message type
 */

import { z } from "zod";
import { AuthSuccessMessage, AuthSuccessMessageSchema, RoomInfo } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AuthSuccessHandler extends BaseMessageHandler<AuthSuccessMessage> {
  readonly type = "auth_success" as const;
  readonly schema = AuthSuccessMessageSchema as z.ZodSchema<AuthSuccessMessage>;

  protected async handleValidated(
    message: AuthSuccessMessage,
    context: HandlerContext
  ): Promise<void> {
    context.logger.info("Authentication successful");

    // Extract and categorize rooms
    const rooms = this.extractRooms(message.data.rooms);
    const { privateRoomIds, sharedRoomIds } = this.categorizeRooms(rooms);

    // Update connection state
    this.updateConnectionState(context, { authenticated: true });

    // Update auth state
    this.updateAuthState(context, {
      authenticated: true,
      clientId: message.data.id,
      walletAddress: message.data.address,
      isWhitelisted: message.data.is_whitelisted,
      isAdmin: message.data.is_admin_whitelisted,
      nftVerified: message.data.nft_verified,

      // Backward compatibility: deprecated fields
      rooms: rooms.map((r) => r.id), // All room IDs
      privateRoomId: message.data.private_room_id, // DEPRECATED: single private room ID

      // v2.0.0: New fields
      roomObjects: rooms, // Full room objects with is_owner field
      privateRoomIds, // Rooms user owns
      sharedRoomIds, // Rooms user is member of
      maxPrivateRooms: message.data.max_private_rooms, // Max rooms user can create

      // Auth enhancement fields (audit #6, #7, #9)
      jwtToken: message.data.jwt_token, // JWT token for KeyVault API
      sessionToken: message.data.session_token, // Session token for fast re-auth
      whitelistVerified: message.data.whitelist_verified, // Whitelist verification status
      userCount: message.data.user_count // Total user count (admin only)
    });

    // Get updated auth state
    const authState = context.getAuthState();

    // Update admin manager with admin status
    if (context.adminManager) {
      context.adminManager.setAdminStatus(message.data.is_admin_whitelisted ?? false);
    }

    // Initialize room management manager with room data (v2.0.0)
    const roomMgmt = context.roomManagementManager;
    if (roomMgmt) {
      // Set room limit
      if (message.data.max_private_rooms) {
        roomMgmt.setRoomLimit(message.data.max_private_rooms);
      }

      // Categorize and cache rooms
      const ownedRooms = rooms.filter((r) => r.is_owner);
      const sharedRooms = rooms.filter((r) => !r.is_owner);
      roomMgmt.setOwnedRooms(ownedRooms);
      roomMgmt.setSharedRooms(sharedRooms);

      context.logger.debug("Room management initialized", {
        owned: ownedRooms.length,
        shared: sharedRooms.length,
        limit: message.data.max_private_rooms
      });
    }

    // Emit events
    this.emit(context, "auth:success", authState);
    this.emit(context, "ready");
  }

  /**
   * Extract and normalize rooms from auth data
   */
  private extractRooms(rooms?: RoomInfo[] | null): RoomInfo[] {
    if (!rooms || !Array.isArray(rooms)) {
      return [];
    }
    return rooms;
  }

  /**
   * Categorize rooms into owned vs member rooms based on is_owner flag
   * @param rooms - Array of room info objects
   * @returns Object with privateRoomIds (owned) and sharedRoomIds (member)
   */
  private categorizeRooms(rooms: RoomInfo[]): {
    privateRoomIds: string[];
    sharedRoomIds: string[];
  } {
    const privateRoomIds: string[] = [];
    const sharedRoomIds: string[] = [];

    for (const room of rooms) {
      if (room.is_owner) {
        privateRoomIds.push(room.id);
      } else {
        sharedRoomIds.push(room.id);
      }
    }

    return { privateRoomIds, sharedRoomIds };
  }
}
