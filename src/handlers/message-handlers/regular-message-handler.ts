/**
 * Handler for regular 'message' type messages
 * Processes messages from agents (when they send 'message' instead of 'task_response')
 */

import { UserMessage, UserMessageSchema } from "../../types";
import { AgentResponse } from "../../types/events";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class RegularMessageHandler extends BaseMessageHandler<UserMessage> {
  readonly type = "message" as const;
  readonly schema = UserMessageSchema;

  protected async handleValidated(message: UserMessage, context: HandlerContext): Promise<void> {
    // Check if this message has a 'from' field and content
    if (!message.from || !message.content) {
      return;
    }

    if (!message.room) {
      context.logger.warn("Inbound 'message' lacks room; proceeding without room context", {
        from: message.from
      });
    }

    const authState = context.getAuthState();
    const fromLower = message.from.toLowerCase();
    const walletLower = authState.walletAddress?.toLowerCase();

    context.logger.debug('Received message type "message"', {
      from: message.from,
      fromLower,
      walletLower
    });

    // If message is NOT from the user's wallet, it's likely from an agent
    // Treat it as an agent response
    if (fromLower !== walletLower) {
      context.logger.info("Treating message as agent response", {
        from: message.from,
        contentPreview:
          typeof message.content === "string" ? message.content.substring(0, 100) : "non-string",
        room: message.room
      });

      // Build agent response
      const response: AgentResponse = {
        taskId: message.data?.task_id || `msg-${Date.now()}`,
        agentId: message.from,
        agentName: message.data?.agent_name || "Agent",
        content:
          typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        contentType: message.content_type || "text/plain",
        success: true,
        timestamp: new Date(),
        humanized:
          typeof message.content === "string" ? message.content : JSON.stringify(message.content)
      };

      // Emit agent:response event
      this.emit(context, "agent:response", response);
    }
  }
}
