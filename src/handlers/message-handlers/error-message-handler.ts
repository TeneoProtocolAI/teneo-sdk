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

    // Surface the envelope-level request_id on the error's details so callers
    // racing quote/error can filter by correlation id. The server echoes the
    // original request_id for api_execute error paths (see
    // teneo-websocket-ai-core handler_helpers.go:sendErrorForRequest).
    const details = {
      ...message.data,
      ...(message.request_id ? { request_id: message.request_id } : {})
    };
    const error = new MessageError(message.content || message.data.message, details);

    // Emit error event
    this.emit(context, "error", error);
  }
}
