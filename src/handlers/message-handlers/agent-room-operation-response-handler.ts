/**
 * Handler for agent_room_operation_response messages (v2.0.0)
 * Processes responses from agent-room operations (add, remove)
 */

import {
  AgentRoomOperationResponse,
  AgentRoomOperationResponseSchema
} from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";
import { SDKError } from "../../types/events";
import { ErrorCode } from "../../types/error-codes";

export class AgentRoomOperationResponseHandler extends BaseMessageHandler<AgentRoomOperationResponse> {
  readonly type = "agent_room_operation_response" as const;
  readonly schema = AgentRoomOperationResponseSchema;

  protected handleValidated(
    message: AgentRoomOperationResponse,
    context: HandlerContext
  ): void {
    const { success, message: errorMessage, room_id, agent_id } = message.data;

    context.logger.debug("Handling agent_room_operation_response", {
      success,
      roomId: room_id,
      agentId: agent_id
    });

    if (!success) {
      // Operation failed - emit error events
      const error = new SDKError(
        errorMessage || "Agent room operation failed",
        ErrorCode.OPERATION_FAILED
      );

      context.logger.error("Agent room operation failed", {
        roomId: room_id,
        agentId: agent_id,
        error: errorMessage
      });

      // Emit both add and remove error events - listeners will filter by room/agent ID
      this.emit(context, "agent_room:add_error", error, room_id);
      this.emit(context, "agent_room:remove_error", error, room_id);

      // Send webhook
      this.sendWebhook(context, "agent_room_operation_error", {
        success: false,
        message: errorMessage,
        room_id,
        agent_id
      });

      return;
    }

    // Operation succeeded
    if (room_id && agent_id) {
      context.logger.info("Agent room operation succeeded", {
        roomId: room_id,
        agentId: agent_id
      });

      // Emit success events
      // The promise handlers in AgentRoomManager will filter by room_id and agent_id
      this.emit(context, "agent_room:agent_added", room_id, agent_id);
      this.emit(context, "agent_room:agent_removed", room_id, agent_id);

      // Send webhook
      this.sendWebhook(context, "agent_room_operation", {
        success: true,
        room_id,
        agent_id,
        message: "Agent room operation completed successfully"
      });
    } else {
      // Unexpected: success but missing required fields
      context.logger.warn("Agent room operation succeeded but missing room_id or agent_id");
    }
  }
}
