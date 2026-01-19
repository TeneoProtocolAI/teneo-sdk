/**
 * Handler for auth messages
 * Handles authentication response from server (both fresh and cached)
 */

import { z } from "zod";
import { AuthMessage, AuthMessageSchema, Room } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AuthMessageHandler extends BaseMessageHandler<AuthMessage> {
  readonly type = "auth" as const;
  readonly schema = AuthMessageSchema as z.ZodSchema<AuthMessage>;

  protected async handleValidated(message: AuthMessage, context: HandlerContext): Promise<void> {
    context.logger.info("Handling auth message", {
      hasData: !!message.data,
      dataKeys: message.data ? Object.keys(message.data) : [],
      to: message.to
    });

    // Check if this is a successful auth response by looking for required fields
    if (message.data?.id || message.data?.address || message.data?.cached_auth || message.to) {
      const isCachedAuth = !!message.data?.cached_auth;
      context.logger.info(
        isCachedAuth ? "Using cached authentication" : "Authentication successful"
      );

      // Extract rooms from both 'rooms' (public) and 'private_rooms' (owned private) arrays
      const publicRooms = this.extractRooms(message.data?.rooms);
      const privateRooms = this.extractRooms(message.data?.private_rooms);

      // Combine all rooms, ensuring correct ownership flags
      // Public rooms from 'rooms' array are NOT owned by the user
      // Private rooms from 'private_rooms' array ARE owned by the user
      const allRooms = [
        ...publicRooms.map((r) => ({
          ...r,
          is_owner: false, // Explicitly set to false - public rooms are not owned
          is_public: r.is_public !== undefined ? r.is_public : true // Ensure is_public is set
        })),
        ...privateRooms.map((r) => ({
          ...r,
          is_owner: true, // Explicitly set to true - private_rooms array means owned
          is_public: r.is_public !== undefined ? r.is_public : false // Ensure is_public is set
        }))
      ];

      const { privateRoomIds, sharedRoomIds } = this.categorizeRooms(allRooms);

      // Update connection state
      this.updateConnectionState(context, { authenticated: true });

      // Update auth state
      this.updateAuthState(context, {
        authenticated: true,
        clientId: message.data?.id || message.to || "",
        walletAddress: message.data?.address || "",
        isWhitelisted: message.data?.is_whitelisted,
        isAdmin: message.data?.is_admin_whitelisted,
        nftVerified: message.data?.nft_verified,
        rooms: allRooms.map((r) => r.id),
        roomObjects: allRooms,
        privateRoomId: message.data?.private_room_id,
        // v2.0.0: New fields
        privateRoomIds, // Rooms user owns
        sharedRoomIds, // Rooms user is member of
        maxPrivateRooms: message.data?.max_private_rooms // Max rooms user can create
      });

      // Initialize room management manager with room data (v2.0.0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roomMgmt = (context as any).roomManagementManager;
      if (roomMgmt) {
        // Set room limit
        if (message.data?.max_private_rooms) {
          roomMgmt.setRoomLimit(message.data.max_private_rooms);
        }

        // Categorize and cache rooms
        const ownedRooms = allRooms.filter((r) => r.is_owner === true);
        const sharedRooms = allRooms.filter((r) => r.is_owner === false);
        roomMgmt.setOwnedRooms(ownedRooms);
        roomMgmt.setSharedRooms(sharedRooms);

        context.logger.debug("Room management initialized from auth message", {
          owned: ownedRooms.length,
          shared: sharedRooms.length,
          limit: message.data?.max_private_rooms
        });
      }

      // Get updated auth state
      const authState = context.getAuthState();

      // Update admin manager with admin status
      if (context.adminManager) {
        context.adminManager.setAdminStatus(message.data?.is_admin_whitelisted ?? false);
      }

      // Emit events
      this.emit(context, "auth:success", authState);
      this.emit(context, "ready");
    }
  }

  /**
   * Extract and normalize rooms from auth data
   */
  private extractRooms(rooms?: Room[]): Room[] {
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
  private categorizeRooms(rooms: Room[]): {
    privateRoomIds: string[];
    sharedRoomIds: string[];
  } {
    const privateRoomIds: string[] = [];
    const sharedRoomIds: string[] = [];

    for (const room of rooms) {
      if (room.is_owner) {
        if (room.id) privateRoomIds.push(room.id);
      } else {
        if (room.id) sharedRoomIds.push(room.id);
      }
    }

    return { privateRoomIds, sharedRoomIds };
  }
}
