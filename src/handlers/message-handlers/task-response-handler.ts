/**
 * Handler for task_response messages
 * Processes agent responses to tasks, with streaming chunk support
 */

import { z } from "zod";
import { TaskResponseMessage, TaskResponseMessageSchema } from "../../types";
import { AgentResponse } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TaskResponseHandler extends BaseMessageHandler<TaskResponseMessage> {
  readonly type = "task_response" as const;
  readonly schema = TaskResponseMessageSchema as z.ZodSchema<TaskResponseMessage>;

  private streamBuffers = new Map<
    string,
    { chunks: string[]; agentId: string; agentName?: string; taskId: string; clientRequestId?: string }
  >();

  protected handleValidated(message: TaskResponseMessage, context: HandlerContext): void {
    const taskId = message.data.task_id;
    const stream = message.data.stream;
    // Extract client_request_id if present - used for streaming correlation
    // because the client cannot know the backend-assigned task_id at send time
    const clientRequestId = (message.data as { client_request_id?: string }).client_request_id;

    context.logger.debug("Handling task_response message", {
      taskId,
      from: message.from,
      streaming: !!stream,
    });

    if (stream) {
      // Streaming path: accumulate chunks
      // Key by clientRequestId if present (preferred) or fall back to taskId
      const bufferKey = clientRequestId ?? taskId;
      if (!this.streamBuffers.has(bufferKey)) {
        this.streamBuffers.set(bufferKey, {
          chunks: [],
          agentId: message.from || "",
          agentName: message.data.agent_name,
          taskId,
          clientRequestId,
        });
      }

      const buffer = this.streamBuffers.get(bufferKey)!;
      buffer.chunks.push(message.content || "");

      this.emit(context, "agent:chunk", {
        taskId,
        clientRequestId,
        agentId: buffer.agentId,
        agentName: buffer.agentName,
        content: message.content || "",
        seq: stream.seq,
      });

      if (stream.final) {
        const assembledContent = buffer.chunks.join("");

        this.emit(context, "agent:stream_end", {
          taskId,
          clientRequestId,
          agentId: buffer.agentId,
          agentName: buffer.agentName,
          assembledContent,
        });

        // Emit agent:response with assembled content for
        // sendMessageWithResponse() backwards compatibility
        const response: AgentResponse = {
          taskId,
          agentId: buffer.agentId,
          agentName: buffer.agentName,
          content: assembledContent,
          contentType: message.content_type,
          success: true,
          timestamp: new Date(),
          raw: message,
          humanized: assembledContent,
        };

        this.emit(context, "agent:response", response);

        // Send webhook with assembled response
        this.sendWebhook(context, "task_response", response, {
          agentId: buffer.agentId,
          taskId,
        });

        this.streamBuffers.delete(bufferKey);
      }

      return;
    }

    // Non-streaming path: existing behavior unchanged
    const response: AgentResponse = {
      taskId,
      agentId: message.from || "",
      agentName: message.data.agent_name,
      content: message.content,
      contentType: message.content_type,
      success: message.data.success !== false,
      error: message.data.error,
      timestamp: new Date(),
      raw: message,
      humanized: message.content,
    };

    this.emit(context, "agent:response", response);

    this.sendWebhook(context, "task_response", response, {
      agentId: response.agentId,
      taskId: response.taskId,
    });
  }
}
