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

  protected async handleValidated(_message: PongMessage, context: HandlerContext): Promise<void> {
    // Pong messages are handled at the WebSocket level (ws library)
    // No special processing needed here
    context.logger.debug("Received pong");
  }
}
