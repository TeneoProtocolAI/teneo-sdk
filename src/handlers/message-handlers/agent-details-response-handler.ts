/**
 * Handler for agent_details_response messages
 * Processes detailed agent information from the server
 */

import { AgentDetailsResponse, AgentDetailsResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentDetailsResponseHandler extends BaseMessageHandler<AgentDetailsResponse> {
  readonly type = "agent_details_response" as const;
  readonly schema = AgentDetailsResponseSchema;

  protected handleValidated(message: AgentDetailsResponse, context: HandlerContext): void {
    const { agent } = message.data;

    context.logger.debug("Handling agent_details_response", {
      agentId: agent.agent_id,
      agentName: agent.agent_name
    });

    // Delegate to agent registry if available
    const agentRegistry = (context as any).agentRegistry;
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
