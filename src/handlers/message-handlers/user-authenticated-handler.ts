/**
 * Handler for user_authenticated messages
 * Processes user authentication broadcasts for presence tracking
 */

import { UserAuthenticatedMessage, UserAuthenticatedMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class UserAuthenticatedHandler extends BaseMessageHandler<UserAuthenticatedMessage> {
  readonly type = "user_authenticated" as const;
  readonly schema = UserAuthenticatedMessageSchema;

  protected handleValidated(message: UserAuthenticatedMessage, context: HandlerContext): void {
    const { wallet } = message.data;

    context.logger.debug("Handling user_authenticated", {
      wallet
    });

    context.logger.info("User authenticated broadcast received", {
      wallet
    });

    // Emit presence event
    this.emit(context, "user:authenticated", { wallet });

    // Note: user_authenticated is not in the WebhookEventType enum, so no webhook is sent
    // This is a broadcast event for presence tracking, not typically needed in webhooks
  }
}
