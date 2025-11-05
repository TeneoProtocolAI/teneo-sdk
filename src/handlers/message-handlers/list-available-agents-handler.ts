/**
 * Handler for available_agents_response messages (v2.0.0)
 * Processes responses from list_available_agents requests
 */

import {
  AvailableAgentsResponse,
  AvailableAgentsResponseSchema
} from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";
import { AgentRoomInfo } from "../../managers/agent-room-manager";

export class ListAvailableAgentsHandler extends BaseMessageHandler<AvailableAgentsResponse> {
  readonly type = "available_agents_response" as const;
  readonly schema = AvailableAgentsResponseSchema;

  protected handleValidated(
    message: AvailableAgentsResponse,
    context: HandlerContext
  ): void {
    const { agents } = message.data;

    context.logger.debug("Handling available_agents_response", {
      agentCount: agents?.length || 0
    });

    // Parse agents array (handle undefined as empty array)
    const agentList: AgentRoomInfo[] = agents || [];

    context.logger.info("Available agents listed", {
      count: agentList.length
    });

    // Note: We don't cache this globally since it's room-specific
    // The AgentRoomManager will cache it with the room context

    // Emit success event
    this.emit(context, "agent_room:available_agents_listed", agentList);

    // Send webhook
    this.sendWebhook(context, "available_agents_listed", {
      agents: agentList,
      count: agentList.length
    });
  }
}
