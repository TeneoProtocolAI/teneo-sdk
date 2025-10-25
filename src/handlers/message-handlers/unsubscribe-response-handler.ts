/**
 * Handler for unsubscribe response messages
 * Processes room unsubscription confirmations
 */

import { UnsubscribeResponse, UnsubscribeResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class UnsubscribeResponseHandler extends BaseMessageHandler<UnsubscribeResponse> {
  readonly type = "unsubscribe" as const;
  readonly schema = UnsubscribeResponseSchema;

  protected handleValidated(message: UnsubscribeResponse, context: HandlerContext): void {
    context.logger.debug("Handling unsubscribe response", {
      roomId: message.data.room_id,
      success: message.data.success
    });

    if (message.data.success) {
      // Update subscription state from server's authoritative list
      if (context.roomManager && message.data.subscriptions) {
        context.roomManager.updateSubscriptions(message.data.subscriptions);
      }

      // Emit room:unsubscribed event
      this.emit(context, "room:unsubscribed", {
        roomId: message.data.room_id,
        subscriptions: message.data.subscriptions || []
      });

      // Send webhook (fire-and-forget)
      this.sendWebhook(context, "room_unsubscribed", {
        roomId: message.data.room_id,
        subscriptions: message.data.subscriptions
      });
    } else {
      context.logger.warn("Room unsubscription failed", {
        roomId: message.data.room_id,
        message: message.data.message
      });

      // Emit error event
      this.emit(context, "error", new Error(`Unsubscription failed: ${message.data.message}`));
    }
  }
}
