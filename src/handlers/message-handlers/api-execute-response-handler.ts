/**
 * Handler for api_execute_response messages (v3.7.0)
 *
 * Successful replies to roomless executeCommand calls arrive as a distinct
 * message type (not task_response) — the server emits api_execute_response
 * only for sentinel-room ("__api_explorer__") tasks so consumers can
 * distinguish API-explorer-style invocations from normal chat replies.
 * See teneo-websocket-ai-core pkg/coordinator/agent.go lines 2329-2346.
 *
 * The SDK unifies both on the outgoing event surface: this handler emits
 * `agent:response` exactly like TaskResponseHandler, so consumers that await
 * `agent:response` (including MessageRouter.executeCommand's waitForEvent
 * filter) work transparently regardless of which path produced the reply.
 */

import { z } from "zod";
import { ApiExecuteResponseMessage, ApiExecuteResponseMessageSchema } from "../../types";
import { AgentResponse } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class ApiExecuteResponseHandler extends BaseMessageHandler<ApiExecuteResponseMessage> {
  readonly type = "api_execute_response" as const;
  readonly schema = ApiExecuteResponseMessageSchema as z.ZodSchema<ApiExecuteResponseMessage>;

  protected handleValidated(message: ApiExecuteResponseMessage, context: HandlerContext): void {
    const taskId = message.data.task_id;

    context.logger.debug("Handling api_execute_response message", {
      taskId,
      from: message.from,
      requestId: message.request_id
    });

    const response: AgentResponse = {
      taskId,
      agentId: message.data.agent_id ?? message.from ?? "",
      agentName: message.data.agent_name ?? message.from,
      content: message.content,
      contentType: message.content_type,
      success: true,
      timestamp: new Date(),
      // Cast is safe: the two schemas share all the fields AgentResponse
      // consumers actually read (content, from, data.task_id, data.client_request_id).
      // api_execute_response differs from task_response only in the type literal.
      raw: message as unknown as AgentResponse["raw"],
      humanized: message.content
    };

    this.emit(context, "agent:response", response);

    this.sendWebhook(context, "task_response", response, {
      agentId: response.agentId,
      taskId: response.taskId
    });
  }
}
