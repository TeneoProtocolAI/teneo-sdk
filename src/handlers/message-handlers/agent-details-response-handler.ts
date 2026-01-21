/**
 * Handler for agent_details_response messages
 * Processes detailed agent information from the server
 */

import { AgentDetailsResponseMessage, AgentDetailsResponseMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentDetailsResponseHandler extends BaseMessageHandler<AgentDetailsResponseMessage> {
  readonly type = "agent_details_response" as const;
  readonly schema = AgentDetailsResponseMessageSchema;

  protected handleValidated(message: AgentDetailsResponseMessage, context: HandlerContext): void {
    if (!message.data?.agent) {
      context.logger.warn("Received agent_details_response without agent data");
      return;
    }

    const { agent } = message.data;

    context.logger.debug("Handling agent_details_response", {
      agentId: agent.agent_id,
      agentName: agent.agent_name
    });

    // Delegate to agent registry if available
    const agentRegistry = context.agentRegistry;
    if (agentRegistry && typeof agentRegistry.handleAgentDetails === "function") {
      agentRegistry.handleAgentDetails(agent);
    }

    context.logger.info("Agent details received", {
      agentId: agent.agent_id,
      agentName: agent.agent_name,
      status: agent.status
    });

    // Send webhook
    this.sendWebhook(context, "agent_details_response", { agent });
  }
}
