/**
 * Handler for success messages
 * Server sends generic success confirmations that can be displayed to users
 */

import { SuccessMessage, SuccessMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class SuccessHandler extends BaseMessageHandler<SuccessMessage> {
  readonly type = "success" as const;
  readonly schema = SuccessMessageSchema;

  protected handleValidated(message: SuccessMessage, context: HandlerContext): void {
    const content = message.content || message.data?.content;

    context.logger.debug("Handling success message", { content });

    // Emit success event
    this.emit(context, "success", content || "Operation successful");

    // Note: Generic success messages are too vague for webhooks
    // Specific success events (room_operation, etc.) have their own handlers
    // Users can listen to the 'success' event if needed
  }
}
