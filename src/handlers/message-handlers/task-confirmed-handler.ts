/**
 * Handler for task_confirmed messages (X402 Payment Flow)
 * Processes confirmation that a task will be executed after payment
 */

import { TaskConfirmedMessage, TaskConfirmedMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskConfirmedHandler extends BaseMessageHandler<TaskConfirmedMessage> {
  readonly type = "task_confirmed" as const;
  readonly schema = TaskConfirmedMessageSchema;

  protected handleValidated(message: TaskConfirmedMessage, context: HandlerContext): void {
    const { task_id, message: confirmMessage } = message.data;

    context.logger.debug("Handling task_confirmed", {
      taskId: task_id,
      message: confirmMessage
    });

    // Delegate to payment manager if available
    const paymentManager = (context as any).paymentManager;
    if (paymentManager && typeof paymentManager.handleTaskConfirmed === "function") {
      paymentManager.handleTaskConfirmed(task_id);
    }

    context.logger.info("Task confirmed for execution", {
      taskId: task_id
    });

    // Emit event
    this.emit(context, "payment:confirmed", task_id);

    // Send webhook
    this.sendWebhook(context, "task_confirmed", { task_id, message: confirmMessage });
  }
}
