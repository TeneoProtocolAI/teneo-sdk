/**
 * Handler for all_agents_response messages (Admin only)
 * Processes paginated agent list for admin users
 */

import { AllAgentsResponse, AllAgentsResponseSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class AllAgentsResponseHandler extends BaseMessageHandler<AllAgentsResponse> {
  readonly type = "all_agents_response" as const;
  readonly schema = AllAgentsResponseSchema;

  protected handleValidated(message: AllAgentsResponse, context: HandlerContext): void {
    const { agents, total, offset, has_more, filter } = message.data;

    context.logger.debug("Handling all_agents_response", {
      count: agents.length,
      total,
      offset,
      hasMore: has_more
    });

    // Delegate to admin manager if available
    const adminManager = context.adminManager;
    if (adminManager && typeof adminManager.handleAllAgentsResponse === "function") {
      adminManager.handleAllAgentsResponse(message.data, message.request_id);
    }

    context.logger.info("All agents response received", {
      count: agents.length,
      total,
      filter
    });

    // Send webhook
    this.sendWebhook(context, "all_agents_response", message.data);
  }
}
