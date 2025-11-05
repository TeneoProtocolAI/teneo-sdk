/**
 * Handler for room_operation_response messages (v2.0.0)
 * Processes responses from room CRUD operations (create, update, delete)
 */

import { RoomOperationResponse, RoomOperationResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";
import { SDKError } from "../../types/events";
import { ErrorCode } from "../../types/error-codes";

export class RoomOperationResponseHandler extends BaseMessageHandler<RoomOperationResponse> {
  readonly type = "room_operation_response" as const;
  readonly schema = RoomOperationResponseSchema;

  protected handleValidated(
    message: RoomOperationResponse,
    context: HandlerContext
  ): void {
    const { success, message: errorMessage, room_id, room } = message.data;

    context.logger.debug("Handling room_operation_response", {
      success,
      roomId: room_id,
      hasRoom: !!room
    });

    if (!success) {
      // Operation failed - emit error event
      const error = new SDKError(
        errorMessage || "Room operation failed",
        ErrorCode.OPERATION_FAILED
      );

      // Try to determine operation type from message
      // Note: Server should ideally send operation type in response
      // For now we emit generic errors and specific listeners will catch relevant ones
      this.emit(context, "room:create_error", error);
      this.emit(context, "room:update_error", error, room_id);
      this.emit(context, "room:delete_error", error, room_id);

      // Send webhook
      this.sendWebhook(context, "room_operation_error", {
        success: false,
        message: errorMessage,
        room_id
      });

      return;
    }

    // Operation succeeded
    if (room) {
      // Create or Update operation (includes room object)
      context.logger.info("Room operation succeeded", {
        roomId: room.id,
        roomName: room.name
      });

      // Determine if this was create or update based on whether we have the room cached
      // Note: Ideally server would send operation type in response
      // For now, handlers will emit both and listeners filter by room_id

      // Update cache via room management manager if available
      const roomManager = (context as any).roomManagementManager;
      if (roomManager && typeof roomManager.upsertRoom === "function") {
        roomManager.upsertRoom(room);
      }

      // Emit success events
      // The promise handlers in RoomManagementManager will filter by room_id
      this.emit(context, "room:created", room);
      this.emit(context, "room:updated", room);

      // Send webhook
      this.sendWebhook(context, "room_operation", {
        success: true,
        room,
        message: "Room operation completed successfully"
      });
    } else if (room_id) {
      // Delete operation (only has room_id, no room object)
      context.logger.info("Room deleted", { roomId: room_id });

      // Remove from cache
      const roomManager = (context as any).roomManagementManager;
      if (roomManager && typeof roomManager.removeRoom === "function") {
        roomManager.removeRoom(room_id);
      }

      // Emit delete success
      this.emit(context, "room:deleted", room_id);

      // Send webhook
      this.sendWebhook(context, "room_deleted", {
        success: true,
        room_id,
        message: "Room deleted successfully"
      });
    } else {
      // Unexpected: success but no room or room_id
      context.logger.warn("Room operation succeeded but no room data provided");
    }
  }
}
