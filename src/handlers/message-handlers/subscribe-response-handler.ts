/**
 * Handler for subscribe response messages
 * Processes room subscription confirmations
 */

import { SubscribeResponse, SubscribeResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class SubscribeResponseHandler extends BaseMessageHandler<SubscribeResponse> {
  readonly type = "subscribe" as const;
  readonly schema = SubscribeResponseSchema;

  protected handleValidated(message: SubscribeResponse, context: HandlerContext): void {
    context.logger.debug("Handling subscribe response", {
      roomId: message.data.room_id,
      success: message.data.success
    });

    if (message.data.success) {
      // Update subscription state from server's authoritative list
      if (context.roomManager && message.data.subscriptions) {
        context.roomManager.updateSubscriptions(message.data.subscriptions);
      }

      // Emit room:subscribed event
      this.emit(context, "room:subscribed", {
        roomId: message.data.room_id,
        subscriptions: message.data.subscriptions || []
      });

      // Send webhook (fire-and-forget)
      this.sendWebhook(context, "room_subscribed", {
        roomId: message.data.room_id,
        subscriptions: message.data.subscriptions
      });
    } else {
      context.logger.warn("Room subscription failed", {
        roomId: message.data.room_id,
        message: message.data.message
      });

      // Emit error event
      this.emit(context, "error", new Error(`Subscription failed: ${message.data.message}`));
    }
  }
}
