/**
 * Handler for room_agents_response messages (v2.0.0)
 * Processes responses from list_room_agents requests
 */

import { RoomAgentsResponse, RoomAgentsResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";
import { SDKError } from "../../types/events";
import { ErrorCode } from "../../types/error-codes";
import { AgentRoomInfo } from "../../managers/agent-room-manager";

export class ListRoomAgentsHandler extends BaseMessageHandler<RoomAgentsResponse> {
  readonly type = "room_agents_response" as const;
  readonly schema = RoomAgentsResponseSchema;

  protected handleValidated(
    message: RoomAgentsResponse,
    context: HandlerContext
  ): void {
    const { room_id, agents } = message.data;

    context.logger.debug("Handling room_agents_response", {
      roomId: room_id,
      agentCount: agents?.length || 0
    });

    if (!room_id) {
      const error = new SDKError(
        "Room agents response missing room_id",
        ErrorCode.VALIDATION_ERROR
      );
      this.emit(context, "agent_room:list_error", error, undefined);
      return;
    }

    // Parse agents array (handle undefined as empty array)
    const agentList: AgentRoomInfo[] = agents || [];

    context.logger.info("Room agents listed", {
      roomId: room_id,
      count: agentList.length
    });

    // Cache via agent room manager if available
    const agentRoomManager = (context as any).agentRoomManager;
    if (agentRoomManager && typeof agentRoomManager.cacheRoomAgents === "function") {
      agentRoomManager.cacheRoomAgents(room_id, agentList);
    }

    // Emit success event
    this.emit(context, "agent_room:agents_listed", room_id, agentList);

    // Send webhook
    this.sendWebhook(context, "room_agents_listed", {
      room_id,
      agents: agentList,
      count: agentList.length
    });
  }
}
