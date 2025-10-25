/**
 * Handler for agent_selected messages
 * Processes coordinator's agent selection
 */

import { AgentSelectedMessage, AgentSelectedMessageSchema } from "../../types";
import { AgentSelectedData } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentSelectedHandler extends BaseMessageHandler<AgentSelectedMessage> {
  readonly type = "agent_selected" as const;
  readonly schema = AgentSelectedMessageSchema;

  protected handleValidated(message: AgentSelectedMessage, context: HandlerContext): void {
    context.logger.debug("Handling agent_selected message", {
      agentId: message.data.agent_id,
      agentName: message.data.agent_name
    });

    // Build agent selected data
    const data: AgentSelectedData = {
      agentId: message.data.agent_id,
      agentName: message.data.agent_name,
      reasoning: message.reasoning || "",
      userRequest: message.data.user_request,
      command: message.data.command,
      commandReasoning: message.data.command_reasoning,
      capabilities: message.data.capabilities
    };

    // Emit agent:selected event
    this.emit(context, "agent:selected", data);

    // Send webhook (fire-and-forget)
    this.sendWebhook(context, "agent_selected", data, {
      agentId: data.agentId
    });
  }
}
