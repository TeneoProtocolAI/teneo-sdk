/**
 * Handler for task_response messages
 * Processes agent responses to tasks
 */

import { z } from "zod";
import { TaskResponseMessage, TaskResponseMessageSchema } from "../../types";
import { AgentResponse } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskResponseHandler extends BaseMessageHandler<TaskResponseMessage> {
  readonly type = "task_response" as const;
  readonly schema = TaskResponseMessageSchema as z.ZodSchema<TaskResponseMessage>;

  protected handleValidated(message: TaskResponseMessage, context: HandlerContext): void {
    context.logger.debug("Handling task_response message", {
      taskId: message.data.task_id,
      from: message.from
    });

    // Build agent response
    const response: AgentResponse = {
      taskId: message.data.task_id,
      agentId: message.from || "",
      agentName: message.data.agent_name,
      content: message.content,
      contentType: message.content_type,
      success: message.data.success !== false,
      error: message.data.error,
      timestamp: new Date(),
      raw: message,
      humanized: message.content
    };

    // Emit agent:response event
    this.emit(context, "agent:response", response);

    // Send webhook (fire-and-forget)
    this.sendWebhook(context, "task_response", response, {
      agentId: response.agentId,
      taskId: response.taskId
    });
  }
}
