/**
 * Handler for ping and pong messages
 * These are keepalive messages that don't require special handling
 */

import { PingMessage, PongMessage, PingMessageSchema, PongMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class PingHandler extends BaseMessageHandler<PingMessage> {
  readonly type = "ping" as const;
  readonly schema = PingMessageSchema;

  protected async handleValidated(_message: PingMessage, context: HandlerContext): Promise<void> {
    // Ping messages are handled at the WebSocket level (ws library)
    // No special processing needed here
    context.logger.debug("Received ping");
  }
}

export class PongHandler extends BaseMessageHandler<PongMessage> {
  readonly type = "pong" as const;
  readonly schema = PongMessageSchema;

  protected async handleValidated(message: PongMessage, context: HandlerContext): Promise<void> {
    // Check if this is a room pong (has room data) or regular pong
    if (message.data && typeof message.data === "object" && "room_id" in message.data) {
      // Room pong - server responds to room_ping with live user count
      const roomData = message.data as {
        room_id: string;
        live_count?: number;
        timestamp: string;
      };

      context.logger.debug("Received room pong", {
        roomId: roomData.room_id,
        liveCount: roomData.live_count,
        timestamp: roomData.timestamp
      });

      // Emit room pong event
      this.emit(context, "room:pong", {
        roomId: roomData.room_id,
        liveCount: roomData.live_count ?? 0,
        timestamp: roomData.timestamp
      });

      // Note: room_pong is an internal keepalive/user-count event, not sent via webhook
      // Users can listen to the 'room:pong' event if needed
    } else {
      // Regular pong - handled at the WebSocket level (ws library)
      context.logger.debug("Received pong");
    }
  }
}
