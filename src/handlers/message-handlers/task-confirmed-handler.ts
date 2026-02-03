/**
 * Handler for task_confirmed messages
 * Server sends this as acknowledgment after confirm_task in the Quote-Confirm flow.
 * Indicates that task execution has begun.
 */

import { TaskConfirmedMessage, TaskConfirmedMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskConfirmedHandler extends BaseMessageHandler<TaskConfirmedMessage> {
  readonly type = "task_confirmed" as const;
  readonly schema = TaskConfirmedMessageSchema;

  protected handleValidated(message: TaskConfirmedMessage, context: HandlerContext): void {
    const taskId = message.data?.task_id ?? message.task_id ?? "";
    const agentId = message.data?.agent_id;
    const agentName = message.data?.agent_name;
    const clientRequestId = message.data?.client_request_id;

    context.logger.debug("Handling task_confirmed", {
      taskId,
      agentId,
      agentName
    });

    context.logger.info("Task confirmed and execution started", {
      taskId,
      agentId,
      agentName
    });

    // Emit task confirmed event
    this.emit(context, "task:confirmed", {
      taskId,
      agentId,
      agentName,
      clientRequestId
    });

    // Send webhook
    this.sendWebhook(context, "task_confirmed", {
      taskId,
      agentId,
      agentName,
      clientRequestId
    });
  }
}
