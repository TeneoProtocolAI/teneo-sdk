/**
 * Handler for auth_error messages
 * Handles authentication errors
 */

import { AuthErrorMessage, AuthErrorMessageSchema } from "../../types";
import { AuthenticationError } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AuthErrorHandler extends BaseMessageHandler<AuthErrorMessage> {
  readonly type = "auth_error" as const;
  readonly schema = AuthErrorMessageSchema;

  protected async handleValidated(
    message: AuthErrorMessage,
    context: HandlerContext
  ): Promise<void> {
    const error = message.data.error || "Authentication failed";
    context.logger.error("Authentication failed", { error });

    // Update states
    this.updateAuthState(context, { authenticated: false });
    this.updateConnectionState(context, {
      lastError: new AuthenticationError(error)
    });

    // Emit error event
    this.emit(context, "auth:error", error);
  }
}
