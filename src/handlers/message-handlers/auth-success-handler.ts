/**
 * Handler for auth_success messages
 * Legacy support for explicit auth_success message type
 */

import { z } from "zod";
import { AuthSuccessMessage, AuthSuccessMessageSchema, Room } from "../../types";
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

    // Extract rooms
    const rooms = this.extractRooms(message.data.rooms);

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
      rooms: rooms.map((r) => r.id),
      roomObjects: rooms,
      privateRoomId: message.data.private_room_id
    });

    // Get updated auth state
    const authState = context.getAuthState();

    // Emit events
    this.emit(context, "auth:success", authState);
    this.emit(context, "ready");
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
