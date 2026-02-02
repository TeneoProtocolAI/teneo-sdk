/**
 * Handler for agent_status_update messages (v2.0.0)
 * Processes real-time agent status updates for rooms
 */

import { AgentStatusUpdateMessage, AgentStatusUpdateMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentStatusUpdateHandler extends BaseMessageHandler<AgentStatusUpdateMessage> {
  readonly type = "agent_status_update" as const;
  readonly schema = AgentStatusUpdateMessageSchema;

  protected handleValidated(message: AgentStatusUpdateMessage, context: HandlerContext): void {
    const { room_id, agent_id, status, agent } = message.data;

    context.logger.debug("Handling agent_status_update", {
      roomId: room_id,
      agentId: agent_id,
      status,
      hasAgent: !!agent
    });

    // Invalidate cache for this room via agent room manager
    const agentRoomManager = context.agentRoomManager;
    if (agentRoomManager && typeof agentRoomManager.handleStatusUpdate === "function") {
      agentRoomManager.handleStatusUpdate(room_id, agent_id, status);
    }

    context.logger.info("Agent status updated", {
      roomId: room_id,
      agentId: agent_id,
      status
    });

    // Emit status update event
    this.emit(context, "agent_room:status_update", {
      roomId: room_id,
      agentId: agent_id,
      status,
      agent
    });

    // Note: Agent status updates fire constantly and would spam webhooks
    // Users can listen to the 'agent_room:status_update' event if needed
  }
}
