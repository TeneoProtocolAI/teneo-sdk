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
  createRequestTask,
  createConfirmTask,
  Logger,
  ResponseFormat,
  TaskResponseMessage,
  TaskQuoteMessage,
  PricingInfo
} from "../types";
import { SDKEvents, SDKError, ValidationError, AgentResponse, PaymentError } from "../types/events";
import { ErrorCode } from "../types/error-codes";
import { TIMEOUTS } from "../constants";
import {
  MessageContentSchema,
  AgentIdSchema,
  AgentCommandContentSchema
} from "../types/validation";
import { waitForEvent } from "../utils/event-waiter";
import { PaymentClient } from "../utils/payment-client";
import { SecurePrivateKey } from "../utils/secure-private-key";

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

export interface QuoteResult {
  taskId: string;
  agentId: string;
  agentName?: string;
  agentWallet: string;
  command?: string;
  pricing: PricingInfo;
  expiresAt: Date;
}

export class MessageRouter extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly responseFormatter: ResponseFormatter;
  private readonly logger: Logger;
  private readonly messageTimeout: number;
  private readonly responseFormat: ResponseFormat;
  private readonly maxPricePerRequest?: number;
  private readonly paymentNetwork: string;
  private readonly paymentAsset: string;
  private readonly autoApproveQuotes: boolean;
  private readonly quoteTimeout: number;
  private readonly wsUrl: string;
  private paymentClient?: PaymentClient;
  private pendingQuotes: Map<string, QuoteResult> = new Map();

  constructor(
    wsClient: WebSocketClient,
    webhookHandler: WebhookHandler,
    responseFormatter: ResponseFormatter,
    logger: Logger,
    config: {
      messageTimeout?: number;
      responseFormat?: ResponseFormat;
      maxPricePerRequest?: number;
      paymentNetwork?: string;
      paymentAsset?: string;
      autoApproveQuotes?: boolean;
      quoteTimeout?: number;
      wsUrl?: string;
    }
  ) {
    super();
    this.wsClient = wsClient;
    this.webhookHandler = webhookHandler;
    this.responseFormatter = responseFormatter;
    this.logger = logger;
    this.messageTimeout = config.messageTimeout ?? TIMEOUTS.DEFAULT_MESSAGE_TIMEOUT;
    this.responseFormat = config.responseFormat ?? "humanized";
    this.maxPricePerRequest = config.maxPricePerRequest;
    this.paymentNetwork = config.paymentNetwork ?? "eip155:3338";
    this.paymentAsset = config.paymentAsset ?? "0xbbA60da06c2c5424f03f7434542280FCAd453d10";
    this.autoApproveQuotes = config.autoApproveQuotes ?? true;
    this.quoteTimeout = config.quoteTimeout ?? 30000;
    this.wsUrl = config.wsUrl ?? "wss://teneo.protocol.ai/ws";

    this.setupEventForwarding();
  }

  public setPaymentClient(secureKey: SecurePrivateKey, walletAddress: string): void {
    this.paymentClient = new PaymentClient(secureKey, walletAddress, {
      network: this.paymentNetwork,
      asset: this.paymentAsset
    });
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
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const validatedContent = MessageContentSchema.parse(content);
    const room = options.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    // Use quote-approve flow with auto-approval
    if (this.autoApproveQuotes) {
      this.logger.debug("MessageRouter: Using quote-approve flow", { content: validatedContent, room });
      const quote = await this.requestQuote(validatedContent, room);
      return await this.confirmQuote(quote.taskId, {
        waitForResponse: options.waitForResponse,
        timeout: options.timeout ?? this.messageTimeout
      });
    }

    // Legacy flow (auto-approval disabled - user must manually confirm quotes)
    const authState = this.wsClient.getAuthState();
    const fromAddress = options.from ?? authState.walletAddress;
    const message = createUserMessage(validatedContent, room, fromAddress);

    this.logger.debug("MessageRouter: Sending message (legacy)", {
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
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const validatedAgent = AgentIdSchema.parse(command.agent);
    const validatedCommand = AgentCommandContentSchema.parse(command.command);

    const room = command.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    const content = `@${validatedAgent} ${validatedCommand}`;

    // Use quote-approve flow with auto-approval (default)
    if (this.autoApproveQuotes) {
      this.logger.debug("MessageRouter: Using quote-approve flow", { content, room });
      const quote = await this.requestQuote(content, room);
      return await this.confirmQuote(quote.taskId, {
        waitForResponse,
        timeout: this.messageTimeout
      });
    }

    // Legacy flow (auto-approval disabled - user must manually confirm quotes)
    const authState = this.wsClient.getAuthState();
    const walletAddress = authState.walletAddress;
    const message = createUserMessage(content, room, walletAddress);

    this.logger.debug("MessageRouter: Sending direct command (legacy)", {
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
   * Requests a quote for a task without auto-approval.
   * Returns the quote data for manual confirmation.
   */
  public async requestQuote(content: string, room: string): Promise<QuoteResult> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Generate unique request ID for correlation (prevents race conditions with concurrent requests)
    const requestId = uuidv4();
    const message = createRequestTask(content, room, requestId);
    this.logger.debug("MessageRouter: Requesting quote", { content, room, requestId });

    await this.wsClient.sendMessage(message);

    // Track request timestamp for fallback matching
    const requestTimestamp = Date.now();
    let quoteMatched = false;

    const quote = await waitForEvent<TaskQuoteMessage>(this.wsClient, "quote:received", {
      timeout: this.quoteTimeout,
      filter: (q) => {
        // Prevent double-matching
        if (quoteMatched) return false;

        // Try to match by client_request_id if server echoes it back
        if (q.data.client_request_id === requestId) {
          quoteMatched = true;
          return true;
        }

        // Fallback: If server doesn't support client_request_id,
        // match the first quote from the expected room within the timeout window
        const timeSinceRequest = Date.now() - requestTimestamp;
        const quoteRoom = q.room;
        const isFromExpectedRoom = quoteRoom === room;
        const isWithinTimeWindow = timeSinceRequest < this.quoteTimeout;

        if (isFromExpectedRoom && isWithinTimeWindow && !q.data.client_request_id) {
          this.logger.debug("Matching quote without client_request_id (server fallback)", {
            quoteRoom,
            expectedRoom: room,
            timeSinceRequest
          });
          quoteMatched = true;
          return true;
        }

        return false;
      },
      timeoutMessage: `Quote request timed out after ${this.quoteTimeout}ms (requestId: ${requestId})`
    });

    const result: QuoteResult = {
      taskId: quote.data.task_id,
      agentId: quote.data.agent_id,
      agentName: quote.data.agent_name,
      agentWallet: quote.data.agent_wallet,
      command: quote.data.command,
      pricing: quote.data.pricing,
      expiresAt: new Date(quote.data.expires_at)
    };

    this.pendingQuotes.set(result.taskId, result);
    return result;
  }

  /**
   * Confirms a quote and executes the task with payment.
   * Can optionally wait for the task response.
   */
  public async confirmQuote(
    taskId: string,
    options?: { waitForResponse?: boolean; timeout?: number }
  ): Promise<FormattedResponse | void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    const quote = this.pendingQuotes.get(taskId);
    if (!quote) {
      throw new ValidationError(`No pending quote found for task ${taskId}`);
    }

    if (new Date() > quote.expiresAt) {
      this.pendingQuotes.delete(taskId);
      throw new SDKError("Quote has expired", ErrorCode.VALIDATION_ERROR);
    }

    // Check price limit (convert from whole USDC to e6 micro-units for comparison)
    // pricePerUnit is in whole USDC (e.g., 0.001), multiply by 1e6 to get micro-units
    if (this.maxPricePerRequest !== undefined) {
      const priceInMicroUnits = quote.pricing.pricePerUnit * 1_000_000;
      if (priceInMicroUnits > this.maxPricePerRequest) {
        throw new PaymentError(
          `Quote price exceeds limit: ${priceInMicroUnits} > ${this.maxPricePerRequest}`,
          ErrorCode.PRICE_LIMIT_EXCEEDED,
          { agentId: quote.agentId, agentPrice: priceInMicroUnits, maxPrice: this.maxPricePerRequest }
        );
      }
    }

    let confirmMessage = createConfirmTask(taskId);

    // Attach payment if payment client is configured
    // Convert pricePerUnit (whole USDC) to micro-units (e6) for on-chain payment
    if (this.paymentClient && quote.pricing.pricePerUnit > 0) {
      try {
        const amountInMicroUnits = quote.pricing.pricePerUnit * 1_000_000;
        const paymentHeader = await this.paymentClient.createPaymentHeader(
          amountInMicroUnits,
          quote.agentWallet,
          this.wsUrl
        );
        confirmMessage = {
          ...confirmMessage,
          data: { ...confirmMessage.data, x402_payment: paymentHeader }
        } as any;
        this.emit("payment:attached", {
          agentId: quote.agentId,
          amount: amountInMicroUnits,
          command: quote.command
        });
      } catch (error) {
        this.logger.error("Failed to create payment header for quote confirmation", error);
        throw new PaymentError("Failed to create payment", ErrorCode.PAYMENT_FAILED, { agentId: quote.agentId });
      }
    }

    this.logger.debug("MessageRouter: Confirming quote", { taskId });

    await this.wsClient.sendMessage(confirmMessage);

    // Delete quote only after successful send (enables retry on network failure)
    this.pendingQuotes.delete(taskId);

    if (options?.waitForResponse) {
      const timeout = options.timeout ?? this.messageTimeout;
      const response = await waitForEvent<AgentResponse>(this.wsClient, "agent:response", {
        timeout,
        filter: (r) => r.taskId === taskId,
        timeoutMessage: `Task response timed out after ${timeout}ms (taskId: ${taskId})`
      });
      return response as FormattedResponse;
    }
  }

  /**
   * Gets a pending quote by task ID.
   */
  public getPendingQuote(taskId: string): QuoteResult | undefined {
    return this.pendingQuotes.get(taskId);
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
            ? (r.raw.data as Record<string, unknown>).client_request_id
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
