/**
 * Handler for error messages
 * Processes error messages from the server
 */

import { ErrorMessage, ErrorMessageSchema } from "../../types";
import { MessageError } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class ErrorMessageHandler extends BaseMessageHandler<ErrorMessage> {
  readonly type = "error" as const;
  readonly schema = ErrorMessageSchema;

  protected async handleValidated(message: ErrorMessage, context: HandlerContext): Promise<void> {
    context.logger.error("Received error message from server", {
      code: message.data.code,
      message: message.data.message
    });

    // Create error object
    const error = new MessageError(message.content || message.data.message, message.data);

    // Emit error event
    this.emit(context, "error", error);
  }
}
