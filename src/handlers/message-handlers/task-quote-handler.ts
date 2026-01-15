/**
 * Handler for task_quote messages (v2.2.0)
 * Processes quotes from the coordinator for the quote-approve payment flow
 */

import { z } from "zod";
import { TaskQuoteMessage, TaskQuoteMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskQuoteHandler extends BaseMessageHandler<TaskQuoteMessage> {
  readonly type = "task_quote" as const;
  readonly schema = TaskQuoteMessageSchema as z.ZodSchema<TaskQuoteMessage>;

  protected handleValidated(message: TaskQuoteMessage, context: HandlerContext): void {
    context.logger.debug("Handling task_quote message", {
      taskId: message.data.task_id,
      agentId: message.data.agent_id,
      price: message.data.pricing?.pricePerUnit
    });

    // Emit quote:received event for MessageRouter to pick up
    this.emit(context, "quote:received", message);

    // Send webhook (fire-and-forget)
    this.sendWebhook(context, "task_quote", message.data, {
      taskId: message.data.task_id,
      agentId: message.data.agent_id
    });
  }
}
