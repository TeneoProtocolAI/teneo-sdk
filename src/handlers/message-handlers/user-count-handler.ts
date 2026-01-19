/**
 * Handler for user_count messages (Admin only)
 * Processes user count broadcasts to admin users
 */

import { UserCountMessage, UserCountMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class UserCountHandler extends BaseMessageHandler<UserCountMessage> {
  readonly type = "user_count" as const;
  readonly schema = UserCountMessageSchema;

  protected handleValidated(message: UserCountMessage, context: HandlerContext): void {
    const { count, timestamp } = message.data;

    context.logger.debug("Handling user_count", {
      count,
      timestamp
    });

    // Delegate to admin manager if available
    const adminManager = context.adminManager;
    if (adminManager && typeof adminManager.handleUserCount === "function") {
      adminManager.handleUserCount(message.data);
    }

    // Emit admin event
    this.emit(context, "admin:user_count", { count, timestamp });

    // Send webhook
    this.sendWebhook(context, "user_count", message.data);
  }
}
