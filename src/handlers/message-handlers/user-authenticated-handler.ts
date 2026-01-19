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

    // Send webhook
    this.sendWebhook(context, "user_authenticated", message.data);
  }
}
