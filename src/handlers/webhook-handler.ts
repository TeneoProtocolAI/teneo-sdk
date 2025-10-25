/**
 * Webhook handler for Teneo Protocol SDK
 * Manages webhook delivery with retries and error handling using Zod validation
 */

import fetch, { RequestInit } from "node-fetch";
import { EventEmitter } from "eventemitter3";
import { z } from "zod";
import { validateWebhookUrl as validateSSRF } from "../utils/ssrf-validator";
import { BoundedQueue } from "../utils/bounded-queue";
import { CircuitBreaker, CircuitBreakerError } from "../utils/circuit-breaker";
import { RetryPolicy } from "../utils/retry-policy";
import {
  WebhookConfig,
  WebhookConfigSchema,
  WebhookEventType,
  WebhookEventTypeSchema,
  WebhookPayload,
  WebhookPayloadSchema,
  BaseMessage,
  BaseMessageSchema,
  Logger,
  LoggerSchema,
  SDKConfig,
  SDKConfigSchema
} from "../types";
import { SDKEvents, WebhookError, ValidationError } from "../types/events";
import { TIMEOUTS, RETRY } from "../constants";

interface WebhookQueueItem {
  payload: WebhookPayload;
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
  error?: Error;
}

export class WebhookHandler extends EventEmitter<SDKEvents> {
  private readonly config: SDKConfig;
  private webhookConfig?: WebhookConfig;
  private readonly logger: Logger;
  private queue: BoundedQueue<WebhookQueueItem>;
  private circuitBreaker: CircuitBreaker;
  private retryPolicy: RetryPolicy;
  private isProcessing = false;
  private processTimer?: NodeJS.Timeout;
  private isDestroyed = false;

  constructor(config: SDKConfig, logger: Logger) {
    super();
    // Validate config and logger with Zod
    this.config = SDKConfigSchema.parse(config);
    this.logger = LoggerSchema.parse(logger);

    // Initialize bounded queue to prevent unbounded memory growth (CB-1)
    // Max 1000 webhooks, drop oldest on overflow
    this.queue = new BoundedQueue<WebhookQueueItem>(1000, "drop-oldest");

    // Initialize circuit breaker for fault tolerance (CB-3)
    // Opens after 5 failures, closes after 2 successes, 60s timeout
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      windowSize: 60000
    });

    // Initialize webhook retry policy (REL-3)
    if (this.config.webhookRetryStrategy) {
      // User provided custom strategy
      this.retryPolicy = new RetryPolicy(this.config.webhookRetryStrategy);
      this.logger.info("Custom webhook retry strategy configured", {
        type: this.config.webhookRetryStrategy.type,
        baseDelay: this.config.webhookRetryStrategy.baseDelay,
        maxDelay: this.config.webhookRetryStrategy.maxDelay,
        maxAttempts: this.config.webhookRetryStrategy.maxAttempts
      });
    } else {
      // Use default exponential backoff matching previous hardcoded behavior
      // Previous: RETRY.BASE_DELAY (1000ms) * 2^(attempt-1), max RETRY.MAX_WEBHOOK_DELAY (30000ms)
      // Default retries: 3
      this.retryPolicy = RetryPolicy.exponential(
        RETRY.BASE_DELAY, // 1000ms base delay
        RETRY.MAX_WEBHOOK_DELAY, // 30000ms max delay
        this.config.webhookRetries ?? 3,
        false // jitter disabled by default for webhooks
      );
    }

    if (this.config.webhookUrl) {
      // Create and validate webhook configuration
      this.webhookConfig = WebhookConfigSchema.parse({
        url: this.config.webhookUrl,
        headers: this.config.webhookHeaders,
        retries: this.config.webhookRetries ?? 3,
        timeout: this.config.webhookTimeout ?? TIMEOUTS.WEBHOOK_TIMEOUT,
        events: ["message", "task_response", "agent_selected", "error"]
      });
    }
  }

  /**
   * Configures or updates webhook settings with runtime validation.
   * Validates the webhook URL for security (HTTPS requirement except localhost)
   * and sets up retry logic, timeout, and event filtering.
   *
   * @param config - Webhook configuration object
   * @param config.url - Webhook endpoint URL (must be HTTPS unless localhost)
   * @param config.headers - Optional HTTP headers to include with requests
   * @param config.retries - Maximum number of retry attempts for failed deliveries (default: 3)
   * @param config.timeout - Request timeout in milliseconds (default: 30000)
   * @param config.events - Array of event types to send webhooks for (default: all events)
   * @throws {WebhookError} If URL is invalid, insecure, or points to private IP ranges
   *
   * @example
   * ```typescript
   * webhookHandler.configure({
   *   url: 'https://api.example.com/webhooks',
   *   headers: { 'Authorization': 'Bearer token' },
   *   retries: 5,
   *   timeout: 60000,
   *   events: ['message', 'agent_selected', 'error']
   * });
   * ```
   */
  public configure(config: WebhookConfig): void {
    // Validate configuration with Zod
    const validatedConfig = WebhookConfigSchema.parse(config);

    this.validateWebhookUrl(validatedConfig.url);

    this.webhookConfig = {
      ...validatedConfig,
      retries: validatedConfig.retries ?? 3,
      timeout: validatedConfig.timeout ?? TIMEOUTS.WEBHOOK_TIMEOUT,
      events: validatedConfig.events ?? ["message", "task_response", "agent_selected", "error"]
    };

    this.logger.info("Webhook configured", {
      url: validatedConfig.url,
      events: this.webhookConfig.events
    });
  }

  /**
   * Sends a webhook for a specific event type with payload validation.
   * Validates event type and payload with Zod schemas before queueing.
   * Webhooks are queued and delivered asynchronously with retry logic.
   * Emits 'webhook:sent', 'webhook:success', or 'webhook:error' events.
   *
   * @param eventType - Type of event to send ('message', 'task_response', 'agent_selected', or 'error')
   * @param data - Event-specific data payload (validated with Zod)
   * @param metadata - Optional metadata to include with the event
   * @returns Promise that resolves when webhook is queued (not when delivered)
   * @throws {ValidationError} If eventType or data fail Zod validation
   *
   * @example
   * ```typescript
   * await webhookHandler.sendWebhook('agent_selected', {
   *   agent_id: 'weather-agent',
   *   agent_name: 'Weather Agent',
   *   capabilities: ['weather-forecast']
   * }, {
   *   agentId: 'weather-agent',
   *   taskId: 'task-123'
   * });
   * ```
   */
  public async sendWebhook(eventType: WebhookEventType, data: any, metadata?: any): Promise<void> {
    if (!this.webhookConfig || this.isDestroyed) {
      return;
    }

    try {
      // Validate event type
      const validatedEventType = WebhookEventTypeSchema.parse(eventType);

      // Check if this event type should trigger a webhook
      if (this.webhookConfig.events && !this.webhookConfig.events.includes(validatedEventType)) {
        return;
      }

      // Create and validate payload
      const payload = WebhookPayloadSchema.parse({
        event: validatedEventType,
        timestamp: new Date().toISOString(),
        data,
        metadata
      });

      // Add to queue (bounded - will drop oldest if full)
      const pushed = this.queue.push({
        payload,
        attempts: 0
      });

      if (!pushed) {
        this.logger.warn("Webhook queue full - oldest webhook dropped", {
          queueSize: this.queue.size()
        });
      }

      // Process queue
      this.processQueue();
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error("Invalid webhook payload", error);
        throw new ValidationError("Invalid webhook payload", error);
      }
      throw error;
    }
  }

  /**
   * Sends a webhook specifically for message events with automatic event type detection.
   * Filters out system messages (ping, pong, auth) and maps message types to webhook events.
   * Validates message with Zod schema before sending.
   *
   * @param message - The message to send as a webhook
   * @returns Promise that resolves when webhook is queued
   * @throws {ValidationError} If message fails Zod validation
   *
   * @example
   * ```typescript
   * const userMessage = createUserMessage('Hello', 'general', walletAddress);
   * await webhookHandler.sendMessageWebhook(userMessage);
   * // Webhook will be sent with event type 'message'
   * ```
   */
  public async sendMessageWebhook(message: BaseMessage): Promise<void> {
    if (!message) return;

    // Skip system messages that shouldn't be sent as webhooks
    const skipMessageTypes = [
      "agents",
      "auth",
      "auth_required",
      "pong",
      "ping",
      "auth_success",
      "auth_error",
      "challenge",
      "request_challenge"
    ];
    if (skipMessageTypes.includes(message.type)) {
      return;
    }

    try {
      // Validate message with Zod
      const validatedMessage = BaseMessageSchema.parse(message);

      let eventType: WebhookEventType;
      switch (validatedMessage.type) {
        case "task_response":
          eventType = "task_response";
          break;
        case "agent_selected":
          eventType = "agent_selected";
          break;
        case "error":
          eventType = "error";
          break;
        default:
          eventType = "message";
      }

      const metadata = {
        messageType: validatedMessage.type,
        from: validatedMessage.from,
        to: validatedMessage.to,
        room: validatedMessage.room,
        taskId: validatedMessage.task_id
      };

      await this.sendWebhook(eventType, validatedMessage, metadata);
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error("Invalid message for webhook", error);
        throw new ValidationError("Invalid message for webhook", error);
      }
      throw error;
    }
  }

  /**
   * Process webhook queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.isEmpty() || this.isDestroyed) {
      return;
    }

    this.isProcessing = true;

    while (!this.queue.isEmpty() && !this.isDestroyed) {
      const item = this.queue.peek();
      if (!item) break; // Queue empty

      // Check if we should retry
      if (item.nextRetry && item.nextRetry > new Date()) {
        // Wait until retry time
        const delay = item.nextRetry.getTime() - Date.now();
        this.processTimer = setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, delay);
        return;
      }

      try {
        // Use circuit breaker for fault tolerance (CB-3)
        await this.circuitBreaker.execute(async () => {
          await this.deliverWebhook(item);
        });
        // Success - remove from queue
        this.queue.shift();
      } catch (error) {
        // Check if circuit breaker is open
        if (error instanceof CircuitBreakerError) {
          this.logger.warn("Circuit breaker is OPEN, pausing webhook delivery", {
            state: error.state
          });
          // Don't retry immediately when circuit is open
          // Queue will be retried when circuit closes
          this.isProcessing = false;
          return;
        }
        // Handle retry logic
        item.attempts++;
        item.lastAttempt = new Date();
        item.error = error as Error;

        // Check if we should retry using the retry policy (REL-3)
        if (!this.retryPolicy.shouldRetry(item.attempts)) {
          // Max retries reached
          this.logger.error("Webhook delivery failed after max retries", {
            url: this.webhookConfig?.url,
            attempts: item.attempts,
            error: error
          });
          this.emit("webhook:error", error as Error, this.webhookConfig?.url ?? "");
          this.queue.shift();
        } else {
          // Schedule retry using configured strategy
          const retryDelay = this.retryPolicy.calculateDelay(item.attempts);
          item.nextRetry = new Date(Date.now() + retryDelay);

          this.logger.warn(`Webhook delivery failed, retrying in ${retryDelay}ms`, {
            url: this.webhookConfig?.url,
            attempt: item.attempts,
            error: error
          });
          this.emit("webhook:retry", item.attempts, this.webhookConfig?.url ?? "");

          // Move to end of queue
          const failedItem = this.queue.shift();
          if (failedItem) {
            this.queue.push(failedItem);
          }
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Deliver a webhook
   */
  private async deliverWebhook(item: WebhookQueueItem): Promise<void> {
    if (!this.webhookConfig) {
      throw new Error("Webhook not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.webhookConfig.timeout);

    try {
      this.logger.debug("Delivering webhook", { url: this.webhookConfig.url });

      const options: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.webhookConfig.headers
        },
        body: JSON.stringify(item.payload),
        signal: controller.signal as any
      };

      const response = await fetch(this.webhookConfig.url, options);

      if (!response.ok) {
        throw new WebhookError(`Webhook returned status ${response.status}`, {
          status: response.status,
          statusText: response.statusText
        });
      }

      const responseData = await response.text();
      this.logger.debug("Webhook delivered successfully", {
        url: this.webhookConfig.url,
        status: response.status
      });

      this.emit("webhook:sent", item.payload, this.webhookConfig.url);
      this.emit("webhook:success", responseData, this.webhookConfig.url);
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new WebhookError("Webhook timeout", {
          timeout: this.webhookConfig.timeout
        });
      }
      throw new WebhookError(`Webhook delivery failed: ${error.message}`, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Validate webhook URL for SSRF vulnerabilities
   * Uses comprehensive SSRF validator to block:
   * - Private IP ranges (RFC1918)
   * - Cloud metadata endpoints (AWS, GCP, Azure)
   * - Kubernetes service discovery
   * - Dangerous internal ports
   * - Localhost (unless allowInsecureWebhooks is enabled)
   */
  private validateWebhookUrl(url: string): void {
    try {
      // Use comprehensive SSRF validator
      // allowInsecureWebhooks controls whether localhost/HTTP is allowed
      validateSSRF(url, this.config.allowInsecureWebhooks ?? false);
    } catch (error: any) {
      throw new WebhookError(`Webhook URL validation failed: ${error.message}`, { url });
    }
  }

  /**
   * Gets the current status of the webhook delivery queue.
   * Useful for monitoring webhook health and detecting delivery issues.
   *
   * @returns Object containing queue statistics
   * @returns {number} returns.pending - Total number of webhooks in queue (including failed)
   * @returns {boolean} returns.processing - Whether queue is currently being processed
   * @returns {number} returns.failed - Number of webhooks that have failed and are awaiting retry
   *
   * @example
   * ```typescript
   * const status = webhookHandler.getQueueStatus();
   * console.log(`Queue: ${status.pending} pending, ${status.failed} failed`);
   * if (status.failed > 10) {
   *   console.warn('High number of failed webhooks detected');
   * }
   * ```
   */
  public getQueueStatus(): {
    pending: number;
    processing: boolean;
    failed: number;
    circuitState: string;
  } {
    const circuitState = this.circuitBreaker.getState();
    return {
      pending: this.queue.size(),
      processing: this.isProcessing,
      failed: this.queue.toArray().filter((item) => item.error).length,
      circuitState: circuitState.state
    };
  }

  /**
   * Clears all pending and failed webhooks from the delivery queue.
   * Warning: This permanently discards all queued webhooks.
   * Use this to recover from queue issues or when webhooks are no longer relevant.
   *
   * @example
   * ```typescript
   * webhookHandler.clearQueue();
   * console.log('All pending webhooks cleared');
   * ```
   */
  public clearQueue(): void {
    this.queue.clear();
    this.logger.info("Webhook queue cleared");
  }

  /**
   * Retries all failed webhooks in the queue immediately.
   * Resets attempt counters and error states for failed webhooks.
   * Useful for recovering from temporary network or endpoint issues.
   *
   * @example
   * ```typescript
   * const status = webhookHandler.getQueueStatus();
   * if (status.failed > 0) {
   *   webhookHandler.retryFailed();
   *   console.log(`Retrying ${status.failed} failed webhooks`);
   * }
   * ```
   */
  public retryFailed(): void {
    const failed = this.queue.toArray().filter((item) => item.error);
    for (const item of failed) {
      item.attempts = 0;
      item.error = undefined;
      item.nextRetry = undefined;
    }
    this.processQueue();
  }

  /**
   * Destroys the webhook handler and cleans up resources.
   * Stops queue processing, clears all timers, removes event listeners,
   * and discards all pending webhooks. After destruction, the handler cannot be reused.
   *
   * @example
   * ```typescript
   * webhookHandler.destroy();
   * console.log('Webhook handler destroyed');
   * ```
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.isProcessing = false;
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = undefined;
    }
    this.clearQueue();
    this.removeAllListeners();
  }

  /**
   * Quick check for whether a webhook URL has been configured.
   * Returns true if configure() has been called with a valid URL.
   *
   * @returns True if webhook is configured, false otherwise
   *
   * @example
   * ```typescript
   * if (webhookHandler.isConfigured) {
   *   console.log('Webhooks are enabled');
   * } else {
   *   console.log('Webhooks not configured');
   * }
   * ```
   */
  public get isConfigured(): boolean {
    return !!this.webhookConfig;
  }

  /**
   * Gets the current webhook configuration including URL, headers, and settings.
   * Returns a defensive copy to prevent external modification of internal state.
   * Returns undefined if webhook has not been configured.
   *
   * @returns Copy of current webhook configuration, or undefined if not configured
   *
   * @example
   * ```typescript
   * const config = webhookHandler.getConfig();
   * if (config) {
   *   console.log(`Webhook URL: ${config.url}`);
   *   console.log(`Max retries: ${config.retries}`);
   *   console.log(`Timeout: ${config.timeout}ms`);
   * }
   * ```
   */
  public getConfig(): WebhookConfig | undefined {
    return this.webhookConfig ? { ...this.webhookConfig } : undefined;
  }
}
