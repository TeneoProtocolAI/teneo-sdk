/**
 * MessageRouter - Manages message sending and routing
 * Handles user messages, direct commands, and message-response patterns
 */

import { EventEmitter } from "eventemitter3";
import { v4 as uuidv4 } from "uuid";
import { WebSocketClient } from "../core/websocket-client";
import { WebhookHandler } from "../handlers/webhook-handler";
import { ResponseFormatter, FormattedResponse } from "../formatters/response-formatter";
import {
  UserMessage,
  createUserMessage,
  Logger,
  ResponseFormat,
  TaskResponseMessage
} from "../types";
import { SDKEvents, SDKError, ValidationError, AgentResponse } from "../types/events";
import { ErrorCode } from "../types/error-codes";
import { TIMEOUTS } from "../constants";
import {
  MessageContentSchema,
  AgentIdSchema,
  AgentCommandContentSchema
} from "../types/validation";
import { waitForEvent } from "../utils/event-waiter";

export interface SendMessageOptions {
  room: string;
  from?: string;
  waitForResponse?: boolean;
  timeout?: number;
  format?: ResponseFormat | "raw" | "humanized";
}

export interface AgentCommand {
  agent: string;
  command: string;
  room: string;
}

export class MessageRouter extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly responseFormatter: ResponseFormatter;
  private readonly logger: Logger;
  private readonly messageTimeout: number;
  private readonly responseFormat: ResponseFormat;

  constructor(
    wsClient: WebSocketClient,
    webhookHandler: WebhookHandler,
    responseFormatter: ResponseFormatter,
    logger: Logger,
    config: {
      messageTimeout?: number;
      responseFormat?: ResponseFormat;
    }
  ) {
    super();
    this.wsClient = wsClient;
    this.webhookHandler = webhookHandler;
    this.responseFormatter = responseFormatter;
    this.logger = logger;
    this.messageTimeout = config.messageTimeout ?? TIMEOUTS.DEFAULT_MESSAGE_TIMEOUT;
    this.responseFormat = config.responseFormat ?? "humanized";

    this.setupEventForwarding();
  }

  /**
   * Sends a message to agents via the coordinator.
   * The coordinator intelligently selects the most appropriate agent.
   * Supports optional response waiting with configurable timeout and format.
   *
   * @param content - The message content to send
   * @param options - Configuration for message sending
   * @param options.room - Room to send to (required)
   * @param options.from - Sender address (defaults to authenticated wallet)
   * @param options.waitForResponse - Whether to wait for response (default: false)
   * @param options.timeout - Response timeout in ms (default: 60000)
   * @param options.format - Response format: 'raw', 'humanized', or 'both'
   * @returns Promise resolving to FormattedResponse if waiting, void otherwise
   * @throws {SDKError} If not connected
   * @throws {ValidationError} If content is empty, room not specified, or options invalid
   * @throws {TimeoutError} If waitForResponse and timeout exceeded
   *
   * @example
   * ```typescript
   * // Fire and forget
   * await messageRouter.sendMessage('What is the weather?', { room: 'general' });
   *
   * // Wait for response
   * const response = await messageRouter.sendMessage('Calculate 2+2', {
   *   room: 'general',
   *   waitForResponse: true,
   *   timeout: 30000
   * });
   * console.log(response.humanized);
   * ```
   */
  public async sendMessage(
    content: string,
    options: SendMessageOptions
  ): Promise<FormattedResponse | void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate content
    const validatedContent = MessageContentSchema.parse(content);

    const room = options.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    // Use custom 'from' address if provided, otherwise use wallet address from auth state
    const authState = this.wsClient.getAuthState();
    const fromAddress = options.from ?? authState.walletAddress;

    const message = createUserMessage(validatedContent, room, fromAddress);

    this.logger.debug("MessageRouter: Sending message", {
      content: validatedContent,
      room,
      from: fromAddress
    });

    if (options.waitForResponse) {
      return await this.sendMessageAndWaitForResponse(message, options);
    } else {
      await this.wsClient.sendMessage(message);
      await this.webhookHandler.sendMessageWebhook(message);
    }
  }

  /**
   * Sends a direct command to a specific agent, bypassing the coordinator.
   * Formats command as "@agentName command" internally.
   *
   * @param command - The direct agent command configuration
   * @param command.agent - Agent ID or name to send command to
   * @param command.command - Command text to send
   * @param command.room - Room to send in (required)
   * @returns Promise that resolves when command is sent
   * @throws {SDKError} If not connected
   * @throws {ValidationError} If agent/command empty or room not specified
   *
   * @example
   * ```typescript
   * await messageRouter.sendDirectCommand({
   *   agent: 'weather-agent',
   *   command: 'Get forecast for Tokyo',
   *   room: 'general'
   * });
   * ```
   */
  public async sendDirectCommand(
    command: AgentCommand,
    waitForResponse: boolean = false
  ): Promise<FormattedResponse | void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Validate command
    const validatedAgent = AgentIdSchema.parse(command.agent);
    const validatedCommand = AgentCommandContentSchema.parse(command.command);

    const room = command.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    // Get wallet address from auth state
    const authState = this.wsClient.getAuthState();
    const walletAddress = authState.walletAddress;

    // Format as direct command
    const content = `@${validatedAgent} ${validatedCommand}`;
    const message = createUserMessage(content, room, walletAddress);

    this.logger.debug("MessageRouter: Sending direct command", {
      agent: validatedAgent,
      command: validatedCommand,
      room,
      from: walletAddress
    });

    const options: SendMessageOptions = {
      room,
      from: walletAddress,
      waitForResponse,
      timeout: this.messageTimeout,
      format: this.responseFormat
    };

    if (waitForResponse) {
      return await this.sendMessageAndWaitForResponse(message, options);
    } else {
      await this.wsClient.sendMessage(message);
      await this.webhookHandler.sendMessageWebhook(message);
    }
  }

  /**
   * Send message and wait for agent response
   * Uses event-waiter utility for clean Promise-based waiting with automatic cleanup
   */
  private async sendMessageAndWaitForResponse(
    message: UserMessage,
    options: SendMessageOptions
  ): Promise<FormattedResponse> {
    // Generate unique request ID for correlation
    const requestId = uuidv4();
    const timeout = options.timeout ?? this.messageTimeout;
    const format = options.format ?? this.responseFormat;

    // Add client_request_id to message data for server-side correlation
    const messageWithId: UserMessage = {
      ...message,
      data: {
        ...(message.data || {}),
        client_request_id: requestId
      }
    };

    this.logger.debug("Sending message with request tracking", { requestId });

    // Send message first (fail fast if send fails)
    await this.wsClient.sendMessage(messageWithId);

    // Wait for agent response with automatic timeout and cleanup
    // The filter ensures we only match responses for THIS specific request
    const requestTimestamp = Date.now();
    let responseMatched = false;

    const response = await waitForEvent<AgentResponse>(this.wsClient, "agent:response", {
      timeout,
      filter: (r) => {
        // Prevent double-matching
        if (responseMatched) return false;

        // Try to match by client_request_id if server echoes it back
        const responseRequestId =
          r.raw?.data && "client_request_id" in r.raw.data
            ? (r.raw.data as any).client_request_id
            : undefined;

        if (responseRequestId === requestId) {
          responseMatched = true;
          return true;
        }

        // Fallback: If server doesn't support client_request_id,
        // match the first response from the expected room within 60 seconds
        // This handles servers that don't echo back client_request_id
        const timeSinceRequest = Date.now() - requestTimestamp;
        const responseRoom = r.raw?.room;
        const isFromExpectedRoom = responseRoom === message.room;
        const isWithinTimeWindow = timeSinceRequest < 60000; // 60 second window

        if (isFromExpectedRoom && isWithinTimeWindow && !responseRequestId) {
          this.logger.debug("Matching response without client_request_id (server fallback)", {
            responseRoom,
            expectedRoom: message.room,
            timeSinceRequest
          });
          responseMatched = true;
          return true;
        }

        return false;
      },
      timeoutMessage: `Message timeout - no response received after ${timeout}ms (requestId: ${requestId})`
    });

    // Format response according to requested format
    if (format === "raw" && response.raw) {
      return response.raw as unknown as FormattedResponse;
    }
    return response as FormattedResponse;
  }

  /**
   * Set up event forwarding from WebSocket client
   */
  private setupEventForwarding(): void {
    // Forward message events
    this.wsClient.on("message:sent", (message) => {
      this.emit("message:sent", message);
      // Fire and forget - don't block event emission
      this.webhookHandler.sendMessageWebhook(message).catch((error) => {
        this.logger.error("Failed to send webhook for message:sent", error);
      });
    });

    this.wsClient.on("message:received", (message) => {
      this.emit("message:received", message);

      // Send webhook for received messages (fire-and-forget)
      if (message.type !== "ping" && message.type !== "pong") {
        this.webhookHandler.sendMessageWebhook(message).catch((error) => {
          this.logger.error("Failed to send webhook for message:received", error);
        });
      }
    });

    this.wsClient.on("message:error", (error, message) =>
      this.emit("message:error", error, message)
    );

    // Forward agent events
    this.wsClient.on("agent:selected", (data) => {
      this.emit("agent:selected", data);
      // Fire and forget - don't block event emission
      this.webhookHandler
        .sendWebhook("agent_selected", data, {
          agentId: data.agentId
        })
        .catch((error) => {
          this.logger.error("Failed to send webhook for agent:selected", error);
        });
    });

    this.wsClient.on("agent:response", (response) => {
      // Format response only if raw message is available
      let enhancedResponse = response;

      if (response.raw) {
        try {
          const formatted = this.responseFormatter.formatTaskResponse(
            response.raw as TaskResponseMessage
          );
          enhancedResponse = {
            ...response,
            ...formatted
          };
        } catch (error) {
          this.logger.debug("Could not format response, using original", {
            error
          });
        }
      }

      // Emit event (waitForEvent listeners will receive this)
      this.emit("agent:response", enhancedResponse);

      // Fire and forget - don't block event emission
      this.webhookHandler
        .sendWebhook("task_response", enhancedResponse, {
          agentId: response.agentId,
          taskId: response.taskId
        })
        .catch((error) => {
          this.logger.error("Failed to send webhook for agent:response", error);
        });
    });

    // Forward coordinator events
    this.wsClient.on("coordinator:processing", (request) =>
      this.emit("coordinator:processing", request)
    );
    this.wsClient.on("coordinator:selected", (agentId, reasoning) =>
      this.emit("coordinator:selected", agentId, reasoning)
    );
    this.wsClient.on("coordinator:error", (error) => this.emit("coordinator:error", error));
  }

  /**
   * Destroys the message router and cleans up resources.
   * Removes all event listeners and marks the router as destroyed.
   * After destruction, the router cannot be reused.
   *
   * Note: Any pending waitForEvent calls will automatically timeout and clean up.
   *
   * @example
   * ```typescript
   * messageRouter.destroy();
   * console.log('Message router destroyed');
   * ```
   */
  public destroy(): void {
    this.logger.info("MessageRouter: Destroying");

    // Remove all event listeners
    // Any pending waitForEvent calls will automatically timeout and clean up
    this.removeAllListeners();
  }
}
