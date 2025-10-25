/**
 * Handler for agents list messages
 * Processes agent list updates from the server
 */

import { z } from "zod";
import { AgentsListMessage, AgentsListMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AgentsListHandler extends BaseMessageHandler<AgentsListMessage> {
  readonly type = "agents" as const;
  readonly schema = AgentsListMessageSchema as z.ZodSchema<AgentsListMessage>;

  protected async handleValidated(
    message: AgentsListMessage,
    context: HandlerContext
  ): Promise<void> {
    context.logger.debug("Handling agents list message", {
      count: message.data.length
    });

    // Emit agent:list event with the agents array
    this.emit(context, "agent:list", message.data);
  }
}
