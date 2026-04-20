/**
 * MessageRouter - Manages message sending and routing
 * Handles user messages, direct commands, and message-response patterns
 * Supports quote-approve payment flow (v2.2.0)
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
  createApiExecute,
  Logger,
  ResponseFormat,
  TaskResponseMessage,
  TaskQuoteMessage,
  PricingInfo,
  RequestSource
} from "../types";
import {
  SDKEvents,
  SDKError,
  ValidationError,
  type AgentResponse,
  PaymentError,
  MessageError
} from "../types/events";
import type { AgentRoomManager } from "./agent-room-manager";
import { ErrorCode } from "../types/error-codes";
import { TIMEOUTS } from "../constants";
import {
  MessageContentSchema,
  AgentIdSchema,
  AgentCommandContentSchema
} from "../types/validation";
import { waitForEvent } from "../utils/event-waiter";
import { PaymentClient, buildX402ResourceUrl, usdcToUnits } from "../payments/payment-client";
import { getDefaultNetwork, getNetwork } from "../payments/networks";
import type { SecurePrivateKey } from "../utils/secure-private-key";

export interface StreamingChunk {
  content: string;
  seq: number;
}

export interface StreamingResponse {
  [Symbol.asyncIterator](): AsyncIterator<StreamingChunk>;
  assembledContent: Promise<string>;
  /**
   * Resolves with the backend-assigned taskId when the first chunk arrives.
   * The client cannot know this value at send time - the backend assigns it
   * during the quote/confirm flow.
   */
  taskId: Promise<string>;
  /**
   * The client-generated request correlation id. Used by the SDK to filter
   * incoming chunks from the backend (which echoes it back in every task_response).
   */
  clientRequestId: string;
}

export interface SendMessageOptions {
  room: string;
  from?: string;
  waitForResponse?: boolean;
  timeout?: number;
  format?: ResponseFormat | "raw" | "humanized";
  network?: string; // Network name override (peaq, base, avalanche) (v2.3.0)
  networkChainId?: number; // Chain ID override (v2.3.0)
}

export interface AgentCommand {
  agent: string;
  command: string;
  room: string;
  network?: string | number; // Per-request network override (v2.3.0)
}

/**
 * Options for executeCommand — roomless one-shot direct agent invocation.
 * Unlike AgentCommand, there is no room field: the server resolves the agent
 * directly via hub.FindAgentByID and the interaction is ephemeral (not
 * persisted to any chat history).
 */
export interface ExecuteCommandOptions {
  agent: string;
  command: string;
  network?: string | number; // Per-request network override (name or chain ID)
}

/**
 * Settlement data from backend for x402x-router-settlement extension
 */
export interface SettlementData {
  settlementRouter: string;
  salt: string;
  facilitatorFee: string;
  hook: string;
  hookData: string;
}

/**
 * Result of a quote request, containing pricing and agent details.
 */
export interface QuoteResult {
  taskId: string;
  agentId: string;
  agentName: string;
  agentWallet: string;
  command: string;
  pricing: PricingInfo;
  expiresAt: Date;
  /** Backend-provided settlement data for x402x-router-settlement */
  settlement: SettlementData;
  /** Per-request network override, carried from requestQuote to confirmQuote (v2.3.0) */
  networkOverride?: string | number;
}

export interface MessageRouterConfig {
  messageTimeout?: number;
  responseFormat?: ResponseFormat;
  autoApproveQuotes?: boolean;
  maxPricePerRequest?: number;
  quoteTimeout?: number;
  wsUrl?: string;
  accessKey?: string; // Access key for session-key payment flow
  paymentNetwork?: string; // CAIP-2 format (e.g., "eip155:3338")
  paymentAsset?: string;
  network?: string; // Network name (e.g., "peaq", "base", "avalanche")
  autoSummon?: boolean; // Auto-add agents to room on "Agent not found" (v2.4.0)
  requestSource?: RequestSource;
}

export class MessageRouter extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly responseFormatter: ResponseFormatter;
  private readonly logger: Logger;
  private readonly messageTimeout: number;
  private readonly responseFormat: ResponseFormat;

  // Quote-approve flow (v2.2.0)
  private paymentClient: PaymentClient | null = null;
  private readonly pendingQuotes: Map<string, QuoteResult> = new Map();
  private readonly autoApproveQuotes: boolean;
  private readonly maxPricePerRequest?: number;
  private readonly quoteTimeout: number;
  private readonly wsUrl: string;
  private readonly accessKey?: string; // Access key for session-key payment
  private readonly paymentNetwork: string; // CAIP-2 format if set
  private readonly paymentAsset: string;
  private readonly networkName: string; // Network name (peaq, base, avalanche)
  private readonly requestSource: RequestSource;

  // Auto-summon (v2.4.0)
  private readonly autoSummon: boolean;
  private agentRoomManager: AgentRoomManager | null = null;

  constructor(
    wsClient: WebSocketClient,
    webhookHandler: WebhookHandler,
    responseFormatter: ResponseFormatter,
    logger: Logger,
    config: MessageRouterConfig
  ) {
    super();
    this.wsClient = wsClient;
    this.webhookHandler = webhookHandler;
    this.responseFormatter = responseFormatter;
    this.logger = logger;
    this.messageTimeout = config.messageTimeout ?? TIMEOUTS.DEFAULT_MESSAGE_TIMEOUT;
    this.responseFormat = config.responseFormat ?? "humanized";

    // Quote-approve config (v2.2.0)
    this.autoApproveQuotes = config.autoApproveQuotes ?? true;
    this.maxPricePerRequest = config.maxPricePerRequest;
    this.quoteTimeout = config.quoteTimeout ?? 30000;
    this.wsUrl = config.wsUrl ?? "";
    this.accessKey = config.accessKey;

    // Store config values - dynamic network resolution happens lazily in getPaymentNetwork/Asset()
    // because networks are only initialized after connect() is called
    this.paymentNetwork = config.paymentNetwork ?? "";
    this.paymentAsset = config.paymentAsset ?? "";
    this.networkName = config.network ?? "";
    this.autoSummon = config.autoSummon ?? true;
    this.requestSource = config.requestSource ?? "sdk";

    this.setupEventForwarding();
  }

  /**
   * Gets the payment network CAIP-2 identifier, resolving from network name or default.
   * Only call this after connect() has been called (networks initialized).
   */
  private getResolvedPaymentNetwork(networkOverride?: string | number): string {
    // Priority: per-request override > paymentNetwork (CAIP-2) > networkName > default
    if (networkOverride) {
      const network = getNetwork(networkOverride);
      return network.caip2;
    }
    if (this.paymentNetwork) {
      return this.paymentNetwork;
    }
    if (this.networkName) {
      const network = getNetwork(this.networkName);
      return network.caip2;
    }
    const defaultNetwork = getDefaultNetwork();
    return defaultNetwork.caip2;
  }

  /**
   * Gets the payment asset, resolving from network name or default.
   * Only call this after connect() has been called (networks initialized).
   */
  private getResolvedPaymentAsset(): string {
    if (this.paymentAsset) {
      return this.paymentAsset;
    }
    if (this.networkName) {
      const network = getNetwork(this.networkName);
      return network.usdcContract;
    }
    const defaultNetwork = getDefaultNetwork();
    return defaultNetwork.usdcContract;
  }

  /**
   * Sets up the payment client for quote-approve flow.
   * Must be called before using requestQuote/confirmQuote with paid tasks.
   */
  public setPaymentClient(secureKey: SecurePrivateKey, walletAddress: string): void {
    this.paymentClient = new PaymentClient(secureKey, walletAddress, {
      network: this.getResolvedPaymentNetwork(),
      asset: this.getResolvedPaymentAsset()
    });
  }

  /**
   * Sets the agent room manager for auto-summon functionality (v2.4.0).
   */
  public setAgentRoomManager(manager: AgentRoomManager): void {
    this.agentRoomManager = manager;
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
   * await messageRouter.sendMessage('What is the weather?', { room: 'room-id' });
   *
   * // Wait for response
   * const response = await messageRouter.sendMessage('Calculate 2+2', {
   *   room: 'room-id',
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

    const validatedContent = MessageContentSchema.parse(content);
    const room = options.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    // Use quote-approve flow with auto-approval (v2.2.0)
    if (this.autoApproveQuotes) {
      const networkOverride = options.network || options.networkChainId;
      this.logger.debug("MessageRouter: Using quote-approve flow", {
        content: validatedContent,
        room,
        network: networkOverride
      });
      const quote = await this.requestQuote(validatedContent, room, networkOverride);
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
   * @param command.network - Optional per-request network override (name like "base" or chain ID like 8453)
   * @param waitForResponse - Whether to wait for agent response (default: false)
   * @returns Promise resolving to FormattedResponse if waiting, void otherwise
   * @throws {SDKError} If not connected
   * @throws {ValidationError} If agent/command empty or room not specified
   *
   * @example
   * ```typescript
   * // Basic usage
   * await messageRouter.sendDirectCommand({
   *   agent: 'weather-agent',
   *   command: 'Get forecast for Tokyo',
   *   room: 'room-id'
   * });
   *
   * // With per-request network override
   * await messageRouter.sendDirectCommand({
   *   agent: 'x-agent-enterprise-v2',
   *   command: 'user @elonmusk',
   *   room: 'room-id',
   *   network: 'base'
   * }, true);
   * ```
   */
  public async sendDirectCommand(
    command: AgentCommand,
    waitForResponse: boolean = false
  ): Promise<FormattedResponse | void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    const validatedAgent = AgentIdSchema.parse(command.agent);
    const validatedCommand = AgentCommandContentSchema.parse(command.command);

    const room = command.room;
    if (!room) {
      throw new ValidationError("Room parameter is required");
    }

    const content = `@${validatedAgent} ${validatedCommand}`;

    // Use quote-approve flow with auto-approval (v2.2.0)
    if (this.autoApproveQuotes) {
      this.logger.debug("MessageRouter: Using quote-approve flow", {
        content,
        room,
        network: command.network
      });
      const quote = await this.requestQuote(content, room, command.network);
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
   * Executes a one-shot direct command against a specific agent, with no room.
   *
   * Unlike sendDirectCommand, this path does NOT require (or use) a room: the
   * server resolves the agent directly by ID, executes the command, and the
   * interaction is ephemeral — not saved to any chat history, not broadcast.
   *
   * Best for programmatic / agent-to-agent / CLI usage where room semantics
   * (history, multi-turn, multi-agent threads) are not needed.
   *
   * Payment behaviour matches sendDirectCommand: when autoApproveQuotes is
   * enabled (default), the SDK auto-confirms the server quote using the
   * configured payment client / access key. When payments are disabled on
   * the server, the response is returned directly without a quote round-trip.
   *
   * @param options.agent - Agent ID (e.g. "x-agent-enterprise-v2")
   * @param options.command - Command text to send to the agent
   * @param options.network - Optional per-request network override (name or chain ID)
   * @param waitForResponse - Whether to await and return the agent's response (default: false)
   * @throws {SDKError} If not connected
   * @throws {ValidationError} If agent or command are empty
   *
   * @example
   * ```typescript
   * // Fire-and-forget
   * await router.executeCommand({ agent: "weather-agent", command: "forecast Tokyo" });
   *
   * // Wait for response (paid or free — SDK handles the quote round-trip)
   * const response = await router.executeCommand(
   *   { agent: "x-agent-enterprise-v2", command: "user @elonmusk", network: "base" },
   *   true
   * );
   * console.log(response.humanized);
   * ```
   */
  public async executeCommand(
    options: ExecuteCommandOptions,
    waitForResponse: boolean = false
  ): Promise<FormattedResponse | void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    const validatedAgent = AgentIdSchema.parse(options.agent);
    const validatedCommand = AgentCommandContentSchema.parse(options.command);
    const content = `@${validatedAgent} ${validatedCommand}`;

    const clientRequestId = uuidv4();

    // Quote-approve path (default): send api_execute, await task_quote,
    // auto-confirm. The server emits a standard task_quote with the sentinel
    // room stamped on it, so the existing confirmQuote path works unchanged.
    if (this.autoApproveQuotes) {
      this.logger.debug("MessageRouter: executeCommand via quote-approve", {
        agent: validatedAgent,
        command: validatedCommand,
        network: options.network,
        clientRequestId
      });

      const quote = await this._executeCommandQuote(content, options.network, clientRequestId);
      return await this.confirmQuote(quote.taskId, {
        waitForResponse,
        timeout: this.messageTimeout
      });
    }

    // Legacy / no-payment path: send api_execute and (optionally) wait for the
    // first task_response matching our client_request_id. No quote round-trip.
    const authState = this.wsClient.getAuthState();
    const fromAddress = authState.walletAddress;
    const resolvedNetwork = options.network
      ? this.getResolvedPaymentNetwork(options.network)
      : undefined;

    const message = createApiExecute(content, {
      from: fromAddress,
      network: resolvedNetwork,
      clientRequestId,
      requestSource: this.requestSource
    });

    this.logger.debug("MessageRouter: executeCommand (legacy/no-payment)", {
      agent: validatedAgent,
      command: validatedCommand,
      network: resolvedNetwork,
      from: fromAddress,
      clientRequestId
    });

    await this.wsClient.sendMessage(message);

    if (!waitForResponse) return;

    const timeout = this.messageTimeout;
    const response = await waitForEvent<AgentResponse>(this.wsClient, "agent:response", {
      timeout,
      filter: (r) => {
        const echoed =
          r.raw?.data && "client_request_id" in r.raw.data
            ? (r.raw.data as { client_request_id?: string }).client_request_id
            : undefined;
        return echoed === clientRequestId;
      },
      timeoutMessage: `executeCommand timed out after ${timeout}ms (clientRequestId: ${clientRequestId})`
    });

    return response as FormattedResponse;
  }

  /**
   * Internal: request a quote via api_execute (roomless).
   *
   * Mirrors _requestQuoteInternal but sends api_execute instead of
   * request_task, and skips auto-summon (roomless calls don't have room
   * membership to summon into).
   */
  private async _executeCommandQuote(
    content: string,
    networkOverride: string | number | undefined,
    clientRequestId: string
  ): Promise<QuoteResult> {
    const resolvedNetwork = this.getResolvedPaymentNetwork(networkOverride);
    const authState = this.wsClient.getAuthState();

    const message = createApiExecute(content, {
      from: authState.walletAddress,
      network: resolvedNetwork,
      clientRequestId,
      requestSource: this.requestSource
    });

    await this.wsClient.sendMessage(message);

    // Race quote:received against error events. Filter strictly on
    // client_request_id so concurrent executeCommand calls cannot cross-fire.
    //
    // The server always echoes ClientRequestID back on the TaskQuoteData when
    // the request carried a top-level request_id (verified in
    // teneo-websocket-ai-core pkg/coordinator/agent.go — QuoteDirectCommand
    // sets ClientRequestID from the handler's msg.RequestID). We always send
    // request_id via createApiExecute, so a missing echo here is a server bug
    // and we deliberately refuse to match it rather than accept a stray quote
    // that belongs to another in-flight call.
    const quotePromise = waitForEvent<TaskQuoteMessage>(this.wsClient, "quote:received", {
      timeout: this.quoteTimeout,
      filter: (q: TaskQuoteMessage) => {
        const echoed = (q.data as { client_request_id?: string }).client_request_id;
        return echoed === clientRequestId;
      },
      timeoutMessage: `executeCommand quote timed out after ${this.quoteTimeout}ms`
    });

    // Filter error events to this specific call. The server echoes the
    // inbound request_id back on the envelope for api_execute error paths
    // (teneo-websocket-ai-core handler_helpers.go:sendErrorForRequest), and
    // error-message-handler.ts surfaces that onto details.request_id. Without
    // this filter, an unrelated concurrent failure would cross-fire into
    // this Promise.race and reject it before the real quote arrives.
    const errorPromise = waitForEvent<MessageError>(this.wsClient, "error", {
      timeout: this.quoteTimeout + 1000,
      filter: (err: MessageError) => {
        const echoed = (err.details as { request_id?: string } | undefined)?.request_id;
        return echoed === clientRequestId;
      }
    });

    // Swallow rejections on the losing branch of Promise.race. If the quote
    // resolves first, the errorPromise is still pending and will eventually
    // either (a) resolve with a late error event or (b) reject with its own
    // timeout — in both cases, without this .catch the `.then(throw)` chain
    // becomes an unhandled rejection.
    const errorBranch = errorPromise.then((err) => {
      throw err;
    });
    errorBranch.catch(() => {
      /* race lost — surfacing the error here would duplicate-reject */
    });

    const quote = await Promise.race([quotePromise, errorBranch]);

    const result: QuoteResult = {
      taskId: quote.data.task_id,
      agentId: quote.data.agent_id,
      agentName: quote.data.agent_name,
      agentWallet: quote.data.agent_wallet,
      command: quote.data.command,
      pricing: quote.data.pricing,
      expiresAt: new Date(quote.data.expires_at),
      settlement: {
        settlementRouter: quote.data.settlement_router,
        salt: quote.data.salt,
        facilitatorFee: quote.data.facilitator_fee,
        hook: quote.data.hook,
        hookData: quote.data.hook_data ?? "0x"
      },
      networkOverride
    };

    this.logger.debug("MessageRouter: executeCommand quote received", {
      taskId: result.taskId,
      agentId: result.agentId,
      clientRequestId
    });

    this.pendingQuotes.set(result.taskId, result);
    return result;
  }

  /**
   * Requests a quote for a task without auto-approval.
   * Returns the quote data for manual confirmation.
   */
  public async requestQuote(
    content: string,
    room: string,
    networkOverride?: string | number
  ): Promise<QuoteResult> {
    return this._requestQuoteInternal(content, room, networkOverride, false);
  }

  /**
   * Internal quote request with error racing and auto-summon support.
   * @param isRetry - true on auto-summon retry to prevent infinite loops
   * @param clientRequestId - optional correlation id (used by streaming flow)
   */
  private async _requestQuoteInternal(
    content: string,
    room: string,
    networkOverride: string | number | undefined,
    isRetry: boolean,
    clientRequestId?: string
  ): Promise<QuoteResult> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo network", ErrorCode.NOT_CONNECTED);
    }

    // Include payment network in request so backend returns correct contract addresses
    const resolvedNetwork = this.getResolvedPaymentNetwork(networkOverride);
    const message = createRequestTask(
      content,
      room,
      resolvedNetwork,
      this.requestSource,
      clientRequestId
    );
    this.logger.debug("MessageRouter: Requesting quote", {
      content,
      room,
      network: resolvedNetwork,
      isRetry
    });

    // Pre-flight autosummon: check cache before sending to avoid reject-retry cycle
    if (this.autoSummon && this.agentRoomManager && !isRetry) {
      const match = content.match(/^@(\S+)/);
      if (match) {
        const agentName = match[1];
        const inRoom = this.agentRoomManager.checkAgentInRoom(room, agentName);
        if (inRoom === false) {
          this.logger.info("MessageRouter: Pre-flight autosummon", { agentName, room });
          try {
            await this.preFlightAutoSummon(agentName, room);
          } catch (e) {
            this.logger.debug("MessageRouter: Pre-flight failed, falling back", {
              error: (e as Error).message
            });
          }
        }
      }
    }

    await this.wsClient.sendMessage(message);

    // Race quote:received against error events to detect "Agent not found" quickly.
    // The backend may signal "agent not in room" via:
    //   1. An "error" event with "agent ... not found"
    //   2. An "agent:response" from the coordinator with content like
    //      "agent X does not have access to room Y"
    // We race all three to catch whichever arrives first.
    const quotePromise = waitForEvent<TaskQuoteMessage>(this.wsClient, "quote:received", {
      timeout: this.quoteTimeout,
      timeoutMessage: `Quote request timed out after ${this.quoteTimeout}ms`
    });

    const errorPromise = waitForEvent<MessageError>(this.wsClient, "error", {
      timeout: this.quoteTimeout + 1000,
      filter: (err: MessageError) => {
        const msg = (err.message || "").toLowerCase();
        return this.isAgentAccessErrorMessage(msg);
      }
    });

    // Also race against agent:response that contains an access-denied error from the coordinator
    const agentErrorPromise = waitForEvent<AgentResponse>(this.wsClient, "agent:response", {
      timeout: this.quoteTimeout + 1000,
      filter: (resp: AgentResponse) => {
        const msg = (resp.content || "").toLowerCase();
        return this.isAgentAccessErrorMessage(msg);
      }
    });

    let quote: TaskQuoteMessage;
    try {
      quote = await Promise.race([
        quotePromise,
        errorPromise.then((err) => {
          throw err;
        }),
        agentErrorPromise.then((resp) => {
          throw new SDKError(resp.content, ErrorCode.AGENT_NOT_IN_ROOM);
        })
      ]);
    } catch (error) {
      if (this.isAgentNotFoundError(error) && !isRetry) {
        if (this.autoSummon) {
          return this.handleAutoSummon(content, room, networkOverride, clientRequestId);
        }
        throw new SDKError(
          "Agent not found in room. Enable autoSummon to automatically add agents.",
          ErrorCode.AGENT_NOT_IN_ROOM
        );
      }
      throw error;
    }

    const result: QuoteResult = {
      taskId: quote.data.task_id,
      agentId: quote.data.agent_id,
      agentName: quote.data.agent_name,
      agentWallet: quote.data.agent_wallet,
      command: quote.data.command,
      pricing: quote.data.pricing,
      expiresAt: new Date(quote.data.expires_at),
      // Backend-provided settlement data for x402x-router-settlement
      settlement: {
        settlementRouter: quote.data.settlement_router,
        salt: quote.data.salt,
        facilitatorFee: quote.data.facilitator_fee,
        hook: quote.data.hook,
        hookData: quote.data.hook_data ?? "0x"
      },
      networkOverride
    };

    this.logger.debug("MessageRouter: Quote received with settlement data", {
      taskId: result.taskId,
      settlementRouter: result.settlement.settlementRouter,
      salt: result.settlement.salt?.substring(0, 20) + "...",
      hook: result.settlement.hook
    });

    this.pendingQuotes.set(result.taskId, result);
    return result;
  }

  /**
   * Pre-flight autosummon: adds agent to room before sending the command.
   * Called when cache confirms agent is NOT in room, avoiding the reject-retry cycle.
   */
  private async preFlightAutoSummon(agentName: string, room: string): Promise<void> {
    if (!this.agentRoomManager) {
      throw new SDKError("Auto-summon requires AgentRoomManager", ErrorCode.AUTOSUMMON_FAILED);
    }

    this.wsClient.emit("autosummon:start", agentName, room);

    const available = await this.agentRoomManager.listAvailableAgents(room, false);
    const agent = available.find((a) => a.agent_id === agentName || a.agent_name === agentName);

    if (!agent) {
      this.wsClient.emit("autosummon:failed", agentName, room, "Agent not found or offline");
      throw new SDKError(
        `Agent '${agentName}' does not exist or is offline`,
        ErrorCode.AGENT_NOT_FOUND
      );
    }

    await this.agentRoomManager.addAgentToRoom(room, agent.agent_id);
    this.wsClient.emit("autosummon:success", agentName, agent.agent_id, room);
    this.logger.info("MessageRouter: Pre-flight autosummon succeeded", { agentId: agent.agent_id });
  }

  /**
   * Handles auto-summon: finds the agent, adds it to the room, and retries the quote.
   * Fallback path triggered by coordinator reject when pre-flight was skipped (cache empty).
   */
  private async handleAutoSummon(
    content: string,
    room: string,
    networkOverride?: string | number,
    clientRequestId?: string
  ): Promise<QuoteResult> {
    if (!this.agentRoomManager) {
      throw new SDKError("Auto-summon requires AgentRoomManager", ErrorCode.AUTOSUMMON_FAILED);
    }

    const match = content.match(/^@(\S+)/);
    if (!match) {
      throw new SDKError("Cannot extract agent name for auto-summon", ErrorCode.AUTOSUMMON_FAILED);
    }
    const agentName = match[1];

    this.logger.info("MessageRouter: Auto-summoning agent", { agentName, room });
    this.wsClient.emit("autosummon:start", agentName, room);

    const available = await this.agentRoomManager.listAvailableAgents(room, false);
    const agent = available.find((a) => a.agent_id === agentName || a.agent_name === agentName);

    if (!agent) {
      this.wsClient.emit("autosummon:failed", agentName, room, "Agent not found or offline");
      throw new SDKError(
        `Agent '${agentName}' does not exist or is offline`,
        ErrorCode.AGENT_NOT_FOUND
      );
    }

    await this.agentRoomManager.addAgentToRoom(room, agent.agent_id);
    this.wsClient.emit("autosummon:success", agentName, agent.agent_id, room);
    this.logger.info("MessageRouter: Agent auto-summoned, retrying", { agentId: agent.agent_id });

    return this._requestQuoteInternal(content, room, networkOverride, true, clientRequestId);
  }

  /**
   * Checks if a message string indicates an agent-access error from the backend.
   * Matches patterns like:
   *   - "agent X not found"
   *   - "agent X does not have access to room Y"
   *   - "Agent not found. Check the agent name..."
   */
  private isAgentAccessErrorMessage(msg: string): boolean {
    if (!msg.includes("agent")) return false;
    return (
      msg.includes("not found") ||
      msg.includes("does not have access") ||
      msg.includes("not in room") ||
      msg.includes("no access")
    );
  }

  /**
   * Checks if an error is an "Agent not found / not in room" error from the backend.
   */
  private isAgentNotFoundError(error: unknown): boolean {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return this.isAgentAccessErrorMessage(msg);
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
      throw new SDKError("Quote has expired", ErrorCode.QUOTE_EXPIRED);
    }

    // Check price limit (pricePerUnit is in USDC, convert to micro-units)
    const priceInUnits = usdcToUnits(quote.pricing.pricePerUnit);
    if (this.maxPricePerRequest !== undefined) {
      if (priceInUnits > this.maxPricePerRequest) {
        this.emit("payment:blocked", {
          agentId: quote.agentId,
          agentPrice: priceInUnits,
          maxPrice: this.maxPricePerRequest
        });
        throw new PaymentError(
          `Quote price exceeds limit: ${priceInUnits} > ${this.maxPricePerRequest}`,
          ErrorCode.PRICE_LIMIT_EXCEEDED,
          { agentId: quote.agentId, agentPrice: priceInUnits, maxPrice: this.maxPricePerRequest }
        );
      }
    }

    let paymentHeader: string | undefined;

    // Create payment header if payment client is configured and price > 0
    if (this.paymentClient && quote.pricing.pricePerUnit > 0 && !this.accessKey) {
      try {
        // Pass backend-provided settlement data to payment header creation
        paymentHeader = await this.paymentClient.createPaymentHeader(
          priceInUnits,
          quote.agentWallet,
          buildX402ResourceUrl(this.wsUrl),
          quote.networkOverride, // Per-request network override (v2.3.0)
          quote.settlement // Backend-provided settlement data
        );
        this.emit("payment:attached", {
          agentId: quote.agentId,
          amount: priceInUnits,
          command: quote.command
        });
      } catch (error) {
        this.logger.error("Failed to create payment header for quote confirmation", error);
        throw new PaymentError("Failed to create payment", ErrorCode.PAYMENT_FAILED, {
          agentId: quote.agentId
        });
      }
    }

    // Build confirm message — x402 payment or access-key, whichever is available
    const confirmMessage = createConfirmTask(taskId, {
      x402Payment: paymentHeader,
      accessKey: this.accessKey,
      network: this.accessKey ? this.networkName || undefined : undefined,
      requestSource: this.requestSource
    });

    this.logger.debug("MessageRouter: Confirming quote", { taskId });

    await this.wsClient.sendMessage(confirmMessage);

    // Delete quote only after successful send (enables retry on network failure)
    this.pendingQuotes.delete(taskId);

    if (options?.waitForResponse) {
      const timeout = options.timeout ?? this.messageTimeout;

      // Race agent:response against error events so backend rejections
      // (e.g. 402 "Payment verification failed") surface immediately
      // instead of silently waiting until timeout.
      const responsePromise = waitForEvent<AgentResponse>(this.wsClient, "agent:response", {
        timeout,
        filter: (r) => r.taskId === taskId,
        timeoutMessage: `Task response timed out after ${timeout}ms (taskId: ${taskId})`
      });

      const errorPromise = waitForEvent<MessageError>(this.wsClient, "error", {
        timeout: timeout + 1000
      });

      const agentErrorPromise = waitForEvent<{
        agentName?: string;
        content?: string;
        taskId?: string;
        room?: string;
      }>(this.wsClient, "agent:error", {
        timeout: timeout + 1000,
        filter: (e) => e.taskId === taskId
      });

      const result = await Promise.race([
        responsePromise,
        errorPromise.then((err) => {
          throw err;
        }),
        agentErrorPromise.then((e) => {
          throw new SDKError(
            e.content || "Agent error during task execution",
            ErrorCode.MESSAGE_ERROR,
            { taskId, agentName: e.agentName }
          );
        })
      ]);

      return result as FormattedResponse;
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
            ? (r.raw.data as any).client_request_id
            : undefined;

        if (responseRequestId === requestId) {
          responseMatched = true;
          return true;
        }

        // Fallback: If server doesn't support client_request_id,
        // match the first response from the expected room within the time window
        // This handles servers that don't echo back client_request_id
        const timeSinceRequest = Date.now() - requestTimestamp;
        const responseRoom = r.raw?.room;
        const isFromExpectedRoom = responseRoom === message.room;
        const isWithinTimeWindow = timeSinceRequest < TIMEOUTS.RESPONSE_MATCH_WINDOW;

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

    this.wsClient.on("agent:chunk", (data) => {
      this.emit("agent:chunk", data);
    });

    this.wsClient.on("agent:stream_end", (data) => {
      this.emit("agent:stream_end", data);
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
   * Sends a message and returns a streaming response with an async iterator.
   * Listens for `agent:chunk` and `agent:stream_end` events matching the taskId.
   *
   * @param content - The message content to send
   * @param options - Configuration for message sending (room is required)
   * @returns StreamingResponse with async iterator, assembledContent promise, and taskId
   */
  public sendMessageStreaming(content: string, options: SendMessageOptions): StreamingResponse {
    // Use client_request_id for correlation - the backend assigns task_id
    // during the quote/confirm flow, so the client cannot know it at send time.
    // The server echoes client_request_id back in every streaming task_response.
    const clientRequestId = uuidv4();
    const chunks: StreamingChunk[] = [];
    let done = false;
    let resolveAssembled: (s: string) => void;
    let rejectAssembled: (e: Error) => void;
    let resolveTaskId: (id: string) => void;
    let rejectTaskId: (e: Error) => void;
    let notifyChunk: (() => void) | null = null;
    let taskIdResolved = false;

    const assembledContent = new Promise<string>((resolve, reject) => {
      resolveAssembled = resolve;
      rejectAssembled = reject;
    });

    const taskIdPromise = new Promise<string>((resolve, reject) => {
      resolveTaskId = resolve;
      rejectTaskId = reject;
    });
    // Prevent unhandled rejection if consumer never awaits taskId
    taskIdPromise.catch(() => {});

    const chunkHandler = (data: any) => {
      if (data.clientRequestId !== clientRequestId) return;
      if (!taskIdResolved && data.taskId) {
        taskIdResolved = true;
        resolveTaskId!(data.taskId);
      }
      chunks.push({ content: data.content, seq: data.seq });
      notifyChunk?.();
    };

    let timer: ReturnType<typeof setTimeout>;

    const endHandler = (data: any) => {
      if (data.clientRequestId !== clientRequestId) return;
      if (!taskIdResolved && data.taskId) {
        taskIdResolved = true;
        resolveTaskId!(data.taskId);
      }
      done = true;
      clearTimeout(timer);
      resolveAssembled!(data.assembledContent);
      cleanup();
      notifyChunk?.();
    };

    const cleanup = () => {
      this.wsClient.off("agent:chunk" as any, chunkHandler);
      this.wsClient.off("agent:stream_end" as any, endHandler);
    };

    this.wsClient.on("agent:chunk" as any, chunkHandler);
    this.wsClient.on("agent:stream_end" as any, endHandler);

    // Kick off the quote/confirm flow directly so we can inject clientRequestId
    // into the outgoing request_task message. The server will echo it back in
    // every task_response (including streaming chunks) for correlation.
    const networkOverride = options.network || options.networkChainId;
    (async () => {
      const quote = await this._requestQuoteInternal(
        content,
        options.room,
        networkOverride,
        false,
        clientRequestId
      );
      await this.confirmQuote(quote.taskId, {
        waitForResponse: false,
        timeout: options.timeout ?? this.messageTimeout
      });
    })().catch((err) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        rejectAssembled!(err instanceof Error ? err : new Error(String(err)));
        if (!taskIdResolved) {
          taskIdResolved = true;
          rejectTaskId!(err instanceof Error ? err : new Error(String(err)));
        }
        cleanup();
        notifyChunk?.();
      }
    });

    // Stream timeout
    const streamTimeout = (options as any).streamTimeout ?? 300_000;
    timer = setTimeout(() => {
      if (!done) {
        done = true;
        if (chunks.length > 0) {
          resolveAssembled!(chunks.map((c) => c.content).join(""));
        } else {
          rejectAssembled!(new Error("Stream timeout — no chunks received"));
        }
        if (!taskIdResolved) {
          taskIdResolved = true;
          rejectTaskId!(new Error("Stream timeout — no chunks received"));
        }
        cleanup();
        notifyChunk?.();
      }
    }, streamTimeout);

    const self: StreamingResponse = {
      clientRequestId,
      taskId: taskIdPromise,
      assembledContent,
      async *[Symbol.asyncIterator]() {
        let yielded = 0;
        while (true) {
          while (yielded < chunks.length) {
            yield chunks[yielded++];
          }
          if (done) return;
          await new Promise<void>((r) => {
            notifyChunk = r;
          });
          notifyChunk = null;
        }
      }
    };

    return self;
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
