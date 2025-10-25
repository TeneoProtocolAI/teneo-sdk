/**
 * Handler for auth_required messages
 * Server is requesting authentication
 */

import { AuthRequiredMessage, AuthRequiredMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AuthRequiredHandler extends BaseMessageHandler<AuthRequiredMessage> {
  readonly type = "auth_required" as const;
  readonly schema = AuthRequiredMessageSchema;

  protected async handleValidated(
    _message: AuthRequiredMessage,
    context: HandlerContext
  ): Promise<void> {
    context.logger.debug("Server requesting authentication");

    // Emit auth:required event
    this.emit(context, "auth:required");
  }
}
