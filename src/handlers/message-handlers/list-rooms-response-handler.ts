/**
 * Handler for room_list_response messages
 * Processes room list from server
 */

import { z } from "zod";
import { ListRoomsResponse, ListRoomsResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class ListRoomsResponseHandler extends BaseMessageHandler<ListRoomsResponse> {
  readonly type = "room_list_response" as const;
  // Cast needed due to Zod transform creating input/output type mismatch
  readonly schema = ListRoomsResponseSchema as z.ZodType<ListRoomsResponse>;

  protected handleValidated(message: ListRoomsResponse, context: HandlerContext): void {
    context.logger.debug("Handling room_list_response", {
      roomCount: message.data.rooms.length
    });

    // Emit room:list event with room info array
    this.emit(context, "room:list", message.data.rooms);

    // Note: This is a query response, not sent via webhook
    // Users can listen to the 'room:list' event if needed
  }
}
