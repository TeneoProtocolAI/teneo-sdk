/**
 * Handler for task_quote messages (X402 Payment Flow)
 * Processes pricing quotes from the server
 */

import { TaskQuoteMessage, TaskQuoteMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskQuoteHandler extends BaseMessageHandler<TaskQuoteMessage> {
  readonly type = "task_quote" as const;
  readonly schema = TaskQuoteMessageSchema;

  protected handleValidated(message: TaskQuoteMessage, context: HandlerContext): void {
    const { task_id, agent_id, agent_name, agent_wallet, command, pricing, expires_at } =
      message.data;

    context.logger.debug("Handling task_quote", {
      taskId: task_id,
      agentId: agent_id,
      agentName: agent_name,
      hasPricing: !!pricing
    });

    // Delegate to payment manager if available
    const paymentManager = context.paymentManager;
    if (paymentManager && typeof paymentManager.handleTaskQuote === "function") {
      paymentManager.handleTaskQuote(message.data, message.request_id);
    }

    context.logger.info("Task quote received", {
      taskId: task_id,
      agentName: agent_name,
      pricePerUnit: pricing?.price_per_unit
    });

    // Emit event with camelCase conversion
    this.emit(context, "payment:quote", {
      taskId: task_id,
      agentId: agent_id,
      agentName: agent_name,
      agentWallet: agent_wallet,
      command,
      pricing: pricing
        ? {
            pricePerUnit: pricing.price_per_unit,
            priceType: pricing.price_type,
            taskUnit: pricing.task_unit,
            timeUnit: pricing.time_unit
          }
        : undefined,
      expiresAt: expires_at
    });

    // Send webhook
    this.sendWebhook(context, "task_quote", message.data);
  }
}
