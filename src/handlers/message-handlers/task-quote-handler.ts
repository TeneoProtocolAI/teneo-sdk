/**
 * Handler for task_quote messages (X402 Payment Flow)
 * Processes pricing quotes from the coordinator
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

    // Delegate to payment manager if available
    const paymentManager = (context as any).paymentManager;
    if (paymentManager && typeof paymentManager.handleTaskQuote === "function") {
      paymentManager.handleTaskQuote(message.data, (message as any).request_id);
    }

    // Emit quote:received event for the requestQuote() method to catch
    this.emit(context, "quote:received", message);

    // Send webhook
    this.sendWebhook(context, "task_quote", message.data, {
      taskId: message.data.task_id,
      agentId: message.data.agent_id
    });
  }
}
