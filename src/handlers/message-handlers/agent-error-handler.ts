/**
 * Handler for agent_error messages
 * Processes agent failure notifications from the server (no payment charged)
 */

import { AgentErrorMessage, AgentErrorMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentErrorHandler extends BaseMessageHandler<AgentErrorMessage> {
  readonly type = "agent_error" as const;
  readonly schema = AgentErrorMessageSchema;

  protected handleValidated(message: AgentErrorMessage, context: HandlerContext): void {
    const { content, from, data, room } = message;

    context.logger.debug("Handling agent_error", {
      from,
      taskId: data?.task_id,
      content
    });

    context.logger.warn("Agent error received", {
      agentName: from,
      content,
      taskId: data?.task_id
    });

    // Emit agent error event
    this.emit(context, "agent:error", {
      agentName: from,
      content,
      taskId: data?.task_id,
      clientRequestId: data?.client_request_id,
      room
    });

    // Send webhook
    this.sendWebhook(context, "agent_error", {
      agentName: from,
      content,
      taskId: data?.task_id,
      clientRequestId: data?.client_request_id,
      room
    });
  }
}
