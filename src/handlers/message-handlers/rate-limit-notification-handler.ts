/**
 * Handler for rate_limit_notification messages
 * Processes rate limit notifications from the server
 */

import { RateLimitNotificationMessage, RateLimitNotificationMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class RateLimitNotificationHandler extends BaseMessageHandler<RateLimitNotificationMessage> {
  readonly type = "rate_limit_notification" as const;
  readonly schema = RateLimitNotificationMessageSchema;

  protected handleValidated(message: RateLimitNotificationMessage, context: HandlerContext): void {
    const {
      title,
      message: msg,
      cta_text,
      cta_link,
      message_type,
      limit_type,
      reset_at
    } = message.data;

    context.logger.warn("Rate limit notification received", {
      title,
      limitType: limit_type,
      resetAt: reset_at
    });

    // Emit rate limit event with camelCase conversion
    this.emit(context, "rate_limit", {
      title,
      message: msg,
      ctaText: cta_text,
      ctaLink: cta_link,
      messageType: message_type,
      limitType: limit_type,
      resetAt: reset_at
    });

    // Send webhook
    this.sendWebhook(context, "rate_limit_notification", message.data);
  }
}
