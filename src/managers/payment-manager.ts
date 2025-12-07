/**
 * PaymentManager - Manages X402 payment flow for agent tasks
 * Handles quote requests, payment confirmation, and task execution with payments
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { Logger, TaskQuoteData } from "../types";
import { SDKError } from "../types/events";
import { ErrorCode } from "../types/error-codes";

/**
 * Events emitted by the PaymentManager
 */
export interface PaymentManagerEvents {
  /** Emitted when a task quote is received from the server */
  "quote:received": (quote: TaskQuoteData) => void;
  /** Emitted when a task is confirmed and ready for execution */
  "task:confirmed": (taskId: string) => void;
  /** Emitted when a payment-related error occurs */
  "payment:error": (error: { taskId?: string; message: string; code?: string }) => void;
}

/**
 * Options for requesting a task quote
 */
export interface RequestQuoteOptions {
  /** The content/prompt to send */
  content: string;
  /** The room to send the message to */
  room: string;
}

/**
 * Options for confirming a task with payment
 */
export interface ConfirmTaskOptions {
  /** The task ID from the quote */
  taskId: string;
  /** The x402 payment payload (base64-encoded) */
  paymentPayload?: string;
}

/**
 * Pending quote waiting for response
 */
interface PendingQuote {
  resolve: (quote: TaskQuoteData) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Pending task confirmation waiting for response
 */
interface PendingConfirmation {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PaymentManager extends EventEmitter<PaymentManagerEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;
  private readonly pendingQuotes = new Map<string, PendingQuote>();
  private readonly pendingConfirmations = new Map<string, PendingConfirmation>();
  private readonly quotes = new Map<string, TaskQuoteData>();

  /** Default timeout for quote requests (30 seconds) */
  private readonly quoteTimeout = 30000;
  /** Default timeout for task confirmations (60 seconds) */
  private readonly confirmTimeout = 60000;

  constructor(wsClient: WebSocketClient, logger: Logger) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
  }

  /**
   * Requests a task quote from the server.
   * This initiates the payment flow by asking the server for pricing information.
   *
   * @param options - The quote request options
   * @returns Promise that resolves with the task quote
   * @throws {SDKError} If not connected to the network
   *
   * @example
   * ```typescript
   * const quote = await paymentManager.requestQuote({
   *   content: "What's the weather in NYC?",
   *   room: "my-room-id"
   * });
   * console.log(`Agent: ${quote.agent_name}`);
   * console.log(`Price: $${quote.pricing?.price_per_unit}`);
   * ```
   */
  public async requestQuote(options: RequestQuoteOptions): Promise<TaskQuoteData> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const { content, room } = options;

    this.logger.info("PaymentManager: Requesting task quote", { room });

    // Generate a temporary ID for tracking the request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Send request_task message
    const message = {
      type: "request_task" as const,
      content,
      room,
      request_id: requestId
    };

    await this.wsClient.sendMessage(message);

    // Wait for the quote response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQuotes.delete(requestId);
        reject(new SDKError("Quote request timed out", ErrorCode.TIMEOUT_ERROR));
      }, this.quoteTimeout);

      this.pendingQuotes.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Confirms a task with payment.
   * Call this after receiving a quote to execute the task with payment.
   *
   * @param options - The confirmation options including task ID and payment
   * @returns Promise that resolves when the task is confirmed
   * @throws {SDKError} If not connected or quote not found
   *
   * @example
   * ```typescript
   * // After receiving a quote
   * await paymentManager.confirm({
   *   taskId: quote.task_id,
   *   paymentPayload: "base64-encoded-x402-payment"
   * });
   * // Now listen for agent:response events for the result
   * ```
   */
  public async confirm(options: ConfirmTaskOptions): Promise<void> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const { taskId, paymentPayload } = options;

    this.logger.info("PaymentManager: Confirming task", { taskId });

    // Send confirm_task message
    const message = {
      type: "confirm_task" as const,
      data: { task_id: taskId },
      ...(paymentPayload && { payment: paymentPayload })
    };

    await this.wsClient.sendMessage(message);

    // Wait for confirmation
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingConfirmations.delete(taskId);
        reject(new SDKError("Task confirmation timed out", ErrorCode.TIMEOUT_ERROR));
      }, this.confirmTimeout);

      this.pendingConfirmations.set(taskId, { resolve, reject, timeout });
    });
  }

  /**
   * Gets a cached quote by task ID.
   *
   * @param taskId - The task ID to look up
   * @returns The quote if found, undefined otherwise
   */
  public getQuote(taskId: string): TaskQuoteData | undefined {
    return this.quotes.get(taskId);
  }

  /**
   * Gets all cached quotes.
   *
   * @returns Array of all cached quotes
   */
  public getAllQuotes(): TaskQuoteData[] {
    return Array.from(this.quotes.values());
  }

  /**
   * Handles incoming task_quote message from server.
   * @internal
   */
  public handleTaskQuote(data: TaskQuoteData): void {
    this.logger.debug("PaymentManager: Received task quote", { taskId: data.task_id });

    // Cache the quote
    this.quotes.set(data.task_id, data);

    // Emit event
    this.emit("quote:received", data);

    // Resolve any pending quote request
    // Note: We match by the first pending request since request_id might not be in response
    const pendingEntries = Array.from(this.pendingQuotes.entries());
    if (pendingEntries.length > 0) {
      const [requestId, pending] = pendingEntries[0];
      clearTimeout(pending.timeout);
      this.pendingQuotes.delete(requestId);
      pending.resolve(data);
    }
  }

  /**
   * Handles incoming task_confirmed message from server.
   * @internal
   */
  public handleTaskConfirmed(taskId: string): void {
    this.logger.debug("PaymentManager: Task confirmed", { taskId });

    // Emit event
    this.emit("task:confirmed", taskId);

    // Resolve pending confirmation
    const pending = this.pendingConfirmations.get(taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingConfirmations.delete(taskId);
      pending.resolve();
    }
  }

  /**
   * Handles payment-related errors.
   * @internal
   */
  public handlePaymentError(taskId: string | undefined, message: string, code?: string): void {
    this.logger.warn("PaymentManager: Payment error", { taskId, message, code });

    this.emit("payment:error", { taskId, message, code });

    // Reject pending confirmation if applicable
    if (taskId) {
      const pending = this.pendingConfirmations.get(taskId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingConfirmations.delete(taskId);
        pending.reject(new SDKError(message, ErrorCode.MESSAGE_ERROR));
      }
    }
  }

  /**
   * Clears all cached quotes and pending requests.
   */
  public clear(): void {
    // Clear pending quotes
    for (const [, pending] of this.pendingQuotes) {
      clearTimeout(pending.timeout);
      pending.reject(new SDKError("Payment manager cleared", ErrorCode.SDK_DESTROYED));
    }
    this.pendingQuotes.clear();

    // Clear pending confirmations
    for (const [, pending] of this.pendingConfirmations) {
      clearTimeout(pending.timeout);
      pending.reject(new SDKError("Payment manager cleared", ErrorCode.SDK_DESTROYED));
    }
    this.pendingConfirmations.clear();

    // Clear quotes cache
    this.quotes.clear();
  }

  /**
   * Destroys the payment manager and cleans up resources.
   */
  public destroy(): void {
    this.logger.info("PaymentManager: Destroying");
    this.clear();
    this.removeAllListeners();
  }
}
