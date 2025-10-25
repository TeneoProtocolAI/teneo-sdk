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

      // Extract rooms
      const rooms = this.extractRooms(message.data?.rooms);

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
        rooms: rooms.map((r) => r.id),
        roomObjects: rooms,
        privateRoomId: message.data?.private_room_id
      });

      // Get updated auth state
      const authState = context.getAuthState();

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
}
