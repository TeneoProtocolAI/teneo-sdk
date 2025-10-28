/**
 * WebSocket client implementation for Teneo Protocol SDK
 * Handles connection, authentication, and message management with Zod validation
 */

import WebSocket from "ws";
import { EventEmitter } from "eventemitter3";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  SDKConfig,
  SDKConfigSchema,
  ConnectionState,
  ConnectionStateSchema,
  AuthenticationState,
  AuthenticationStateSchema,
  BaseMessage,
  BaseMessageSchema,
  createRequestChallenge,
  createCheckCachedAuth,
  createPing,
  safeParseMessage,
  Logger
} from "../types";
import {
  SDKEvents,
  ConnectionError,
  AuthenticationError,
  TimeoutError,
  ValidationError,
  MessageError,
  SignatureVerificationError
} from "../types/events";
import { TIMEOUTS, RETRY, LIMITS } from "../constants";
import { MessageHandlerRegistry } from "../handlers/message-handler-registry";
import { getDefaultHandlers } from "../handlers/message-handlers";
import { HandlerContext } from "../handlers/message-handlers/types";
import { createPinoLogger } from "../utils/logger";
import { TokenBucketRateLimiter } from "../utils/rate-limiter";
import { SignatureVerifier } from "../utils/signature-verifier";
import { SecurePrivateKey } from "../utils/secure-private-key";
import { RetryPolicy } from "../utils/retry-policy";
import { DeduplicationCache } from "../utils/deduplication-cache";

export class WebSocketClient extends EventEmitter<SDKEvents> {
  private ws?: WebSocket;
  private config: SDKConfig;
  private logger: Logger;
  private account?: PrivateKeyAccount;
  private secureKey?: SecurePrivateKey;
  private ownsSecureKey: boolean = false; // Track if we created the SecurePrivateKey
  private handlerRegistry: MessageHandlerRegistry;
  private rateLimiter?: TokenBucketRateLimiter;
  private signatureVerifier?: SignatureVerifier;
  private deduplicationCache?: DeduplicationCache;
  private reconnectPolicy: RetryPolicy;
  private roomManager?: any; // Reference to RoomManager for handler context
  private intentionalDisconnect: boolean = false; // Track intentional disconnect to prevent reconnection

  private connectionState: ConnectionState = {
    connected: false,
    authenticated: false,
    reconnecting: false,
    reconnectAttempts: 0
  };

  private authState: AuthenticationState = {
    authenticated: false
  };

  private messageQueue: BaseMessage[] = [];
  private pendingMessages = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private connectionTimer?: NodeJS.Timeout;

  constructor(config: SDKConfig) {
    super();
    // Validate configuration with Zod
    this.config = SDKConfigSchema.parse(config);
    this.logger = this.config.logger || this.createDefaultLogger();

    // Initialize message handler registry
    this.handlerRegistry = new MessageHandlerRegistry(this.logger);

    if (config.privateKey) {
      try {
        // Check if privateKey is already a SecurePrivateKey instance (SEC-3)
        if (typeof config.privateKey === "object" && "use" in config.privateKey) {
          // Use the provided SecurePrivateKey directly
          this.secureKey = config.privateKey;
          this.ownsSecureKey = false; // User provided it, we don't own it

          // Create account using the secure key
          this.account = this.secureKey.use((key) => privateKeyToAccount(key as `0x${string}`));
        } else {
          // privateKey is a plain string - encrypt it immediately
          const privateKeyString = config.privateKey as string;

          // Ensure the private key starts with 0x
          const privateKey = privateKeyString.startsWith("0x")
            ? (privateKeyString as `0x${string}`)
            : (`0x${privateKeyString}` as `0x${string}`);

          // Encrypt the private key immediately (SEC-3)
          this.secureKey = new SecurePrivateKey(privateKey);
          this.ownsSecureKey = true; // We created it, we own it

          // Create account using the secure key
          this.account = this.secureKey.use((key) => privateKeyToAccount(key as `0x${string}`));
        }

        if (
          config.walletAddress &&
          this.account.address.toLowerCase() !== config.walletAddress.toLowerCase()
        ) {
          throw new Error("Private key does not match provided wallet address");
        }

        // Remove plaintext private key from config to prevent exposure
        // Note: We modify a copy to avoid mutating the original config object
        this.config = { ...config, privateKey: undefined };
      } catch (error) {
        // Clean up secure key if initialization fails (only if we created it)
        if (this.secureKey && this.ownsSecureKey) {
          this.secureKey.destroy();
          this.secureKey = undefined;
        }
        throw new AuthenticationError("Invalid private key", error);
      }
    }

    // Register all default message handlers
    this.handlerRegistry.registerAll(getDefaultHandlers(config.clientType || "user"));

    // Initialize rate limiter if configured (CB-2)
    if (this.config.maxMessagesPerSecond) {
      // Burst capacity = 2x rate (allows temporary spikes)
      const burstCapacity = this.config.maxMessagesPerSecond * 2;
      this.rateLimiter = new TokenBucketRateLimiter(
        this.config.maxMessagesPerSecond,
        burstCapacity
      );
      this.logger.info("Rate limiter initialized", {
        rate: this.config.maxMessagesPerSecond,
        burst: burstCapacity
      });
    }

    // Initialize signature verifier if configured (SEC-2)
    if (this.config.validateSignatures) {
      this.signatureVerifier = new SignatureVerifier({
        trustedAddresses: this.config.trustedAgentAddresses as any[],
        requireSignaturesFor: this.config.requireSignaturesFor,
        strictMode: this.config.strictSignatureValidation
      });
      this.logger.info("Signature verifier initialized", {
        strictMode: this.config.strictSignatureValidation,
        trustedAddressCount: this.config.trustedAgentAddresses?.length || 0,
        requiredTypes: this.config.requireSignaturesFor?.length || 0
      });
    }

    // Initialize reconnection retry policy (REL-3)
    if (this.config.reconnectStrategy) {
      // User provided custom strategy
      this.reconnectPolicy = new RetryPolicy(this.config.reconnectStrategy);
      this.logger.info("Custom reconnection strategy configured", {
        type: this.config.reconnectStrategy.type,
        baseDelay: this.config.reconnectStrategy.baseDelay,
        maxDelay: this.config.reconnectStrategy.maxDelay,
        maxAttempts: this.config.reconnectStrategy.maxAttempts
      });
    } else {
      // Use default exponential backoff matching previous hardcoded behavior
      this.reconnectPolicy = RetryPolicy.exponential(
        this.config.reconnectDelay || 5000,
        RETRY.MAX_RECONNECT_DELAY,
        this.config.maxReconnectAttempts || 10,
        true // jitter enabled by default
      );
    }

    // Initialize message deduplication cache if configured (CB-4)
    if (this.config.enableMessageDeduplication !== false) {
      // Default to enabled if not explicitly disabled
      const ttl = this.config.messageDedupeTtl || 60000; // 1 minute default
      const maxSize = this.config.messageDedupMaxSize || 10000; // 10k default
      this.deduplicationCache = new DeduplicationCache(ttl, maxSize);
      this.logger.info("Message deduplication enabled", {
        ttl,
        maxSize
      });
    }
  }

  /**
   * Set the RoomManager instance for handler context
   * Called by TeneoSDK after initialization
   */
  public setRoomManager(roomManager: any): void {
    this.roomManager = roomManager;
  }

  /**
   * Establishes a WebSocket connection to the Teneo server.
   * Handles connection timeout, authentication challenge-response flow,
   * and automatic message queue processing after successful connection.
   * Emits 'connection:open', 'auth:challenge', 'auth:success', and 'ready' events.
   *
   * @returns Promise that resolves when connection and authentication are complete
   * @throws {TimeoutError} If connection times out (default: 30 seconds)
   * @throws {ConnectionError} If WebSocket connection fails
   * @throws {AuthenticationError} If authentication fails or times out
   *
   * @example
   * ```typescript
   * const wsClient = new WebSocketClient(config);
   * await wsClient.connect();
   * console.log('Connected and authenticated');
   * ```
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info("Connecting to WebSocket server", {
        url: this.config.wsUrl
      });

      // Clear any existing connection
      this.disconnect();

      // Reset intentional disconnect flag after clearing connection
      // This allows automatic reconnection for this new connection
      this.intentionalDisconnect = false;

      // Build connection URL with webhook parameter
      let url = this.config.wsUrl;
      if (this.config.webhookUrl) {
        const separator = url.includes("?") ? "&" : "?";
        url += `${separator}webhookUrl=${encodeURIComponent(this.config.webhookUrl)}`;
      }

      // Create WebSocket connection
      this.ws = new WebSocket(url, {
        headers: this.config.webhookHeaders,
        handshakeTimeout: this.config.connectionTimeout || TIMEOUTS.CONNECTION_TIMEOUT,
        maxPayload: this.config.maxMessageSize || LIMITS.MAX_MESSAGE_SIZE
      });

      // Set connection timeout
      this.connectionTimer = setTimeout(() => {
        this.ws?.close();
        reject(new TimeoutError("Connection timeout", { url }));
      }, this.config.connectionTimeout || TIMEOUTS.CONNECTION_TIMEOUT);

      // Handle connection open
      this.ws.on("open", async () => {
        clearTimeout(this.connectionTimer);
        this.logger.info("WebSocket connection established");

        this.updateConnectionState({
          connected: true,
          reconnecting: false,
          reconnectAttempts: 0,
          lastConnectedAt: new Date()
        });

        this.emit("connection:open");
        this.startPingInterval();

        try {
          await this.authenticate();
          this.processMessageQueue();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      // Handle messages
      this.ws.on("message", (data) => {
        try {
          const rawMessage = JSON.parse(data.toString());
          // Validate message with Zod
          const parseResult = safeParseMessage(rawMessage);

          if (parseResult.success) {
            this.handleMessage(parseResult.data as BaseMessage);
          } else {
            this.logger.error("Invalid message format", parseResult.error);
            this.emit(
              "message:error",
              new ValidationError("Invalid message format", parseResult.error),
              rawMessage
            );
          }
        } catch (error) {
          this.logger.error("Failed to parse message", error);
          this.emit("message:error", new MessageError("Failed to parse message", error));
        }
      });

      // Handle errors
      this.ws.on("error", (error) => {
        clearTimeout(this.connectionTimer);
        this.logger.error("WebSocket error", error);
        this.emit("connection:error", error as Error);

        if (!this.connectionState.connected) {
          reject(new ConnectionError("Failed to connect", error));
        }
      });

      // Handle close
      this.ws.on("close", (code, reason) => {
        clearTimeout(this.connectionTimer);
        this.logger.info("WebSocket connection closed", {
          code,
          reason: reason.toString()
        });

        this.updateConnectionState({
          connected: false,
          authenticated: false,
          lastDisconnectedAt: new Date(),
          lastError: new Error(`Connection closed: ${reason}`)
        });

        this.updateAuthState({ authenticated: false });
        this.emit("connection:close", code, reason.toString());

        this.stopPingInterval();
        this.handleReconnection();
      });

      // Handle pong
      this.ws.on("pong", () => {
        this.logger.debug("Received pong");
      });
    });
  }

  /**
   * Disconnects from the WebSocket server and cleans up all resources.
   * Stops reconnection attempts, clears all timers, rejects pending messages,
   * and updates connection state. Emits 'disconnect' event.
   *
   * @example
   * ```typescript
   * wsClient.disconnect();
   * console.log('Disconnected from server');
   * ```
   */
  public disconnect(): void {
    this.logger.info("Disconnecting from WebSocket server");

    // Mark as intentional disconnect to prevent reconnection
    this.intentionalDisconnect = true;

    // Clear all timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }

    // Clear pending messages
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingMessages.clear();

    // Close WebSocket
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close(1000, "Client disconnect");
      this.ws = undefined;
    }

    // Clean up secure key (SEC-3) - only if we created it
    if (this.secureKey && this.ownsSecureKey) {
      this.secureKey.destroy();
      this.secureKey = undefined;
      this.ownsSecureKey = false;
    }

    // Clear deduplication cache (CB-4)
    if (this.deduplicationCache) {
      this.deduplicationCache.clear();
    }

    // Update state
    this.updateConnectionState({
      connected: false,
      authenticated: false,
      reconnecting: false
    });

    this.updateAuthState({ authenticated: false });
    this.emit("disconnect");
  }

  /**
   * Sends a message to the WebSocket server with validation and queueing support.
   * Validates message with Zod schema, enforces size limits, and queues messages
   * during reconnection. Adds timestamp if not present. Emits 'message:sent' event.
   *
   * @param message - The message to send
   * @returns Promise that resolves when message is sent successfully
   * @throws {ValidationError} If message fails Zod validation
   * @throws {MessageError} If message size exceeds limit
   * @throws {ConnectionError} If not connected and reconnection is disabled
   *
   * @example
   * ```typescript
   * const message = createUserMessage('Hello', 'general', walletAddress);
   * await wsClient.sendMessage(message);
   * console.log('Message sent');
   * ```
   */
  public async sendMessage(message: BaseMessage): Promise<void> {
    // Validate outgoing message with Zod
    let validatedMessage: BaseMessage;
    try {
      validatedMessage = BaseMessageSchema.parse(message);
    } catch (error) {
      this.logger.error("Failed to validate message", error);
      if (error instanceof z.ZodError) {
        throw new ValidationError("Invalid message format", error);
      }
      throw new MessageError("Failed to validate message", error);
    }

    // Check connection
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.config.reconnect && this.connectionState.reconnecting) {
        // Queue message if reconnecting
        this.messageQueue.push(validatedMessage);
        this.logger.debug("Message queued for reconnection", {
          type: validatedMessage.type
        });
        return;
      } else {
        throw new ConnectionError("WebSocket is not connected");
      }
    }

    // Add timestamp if not present
    if (!validatedMessage.timestamp) {
      validatedMessage.timestamp = new Date().toISOString();
    }

    // Apply rate limiting if configured (CB-2)
    if (this.rateLimiter) {
      try {
        await this.rateLimiter.consume();
      } catch (error) {
        this.logger.warn("Rate limit exceeded, waiting for token", {
          type: validatedMessage.type
        });
        throw new MessageError("Rate limit exceeded", error);
      }
    }

    // Prepare message data
    const data = JSON.stringify(validatedMessage);

    if (data.length > (this.config.maxMessageSize || LIMITS.MAX_MESSAGE_SIZE)) {
      throw new Error("Message size exceeds maximum allowed");
    }

    // Send message
    return new Promise((resolve, reject) => {
      this.ws!.send(data, (error) => {
        if (error) {
          this.logger.error("Failed to send message", error);
          reject(error);
        } else {
          this.logger.debug("Message sent", { type: validatedMessage.type });
          this.emit("message:sent", validatedMessage);
          resolve();
        }
      });
    });
  }

  /**
   * Sends a message and waits for a response with the same message ID.
   * Implements request-response pattern over WebSocket with timeout support.
   * Message is automatically assigned a unique ID for correlation.
   *
   * @template T - Expected response type
   * @param message - The message to send
   * @param timeout - Optional timeout in milliseconds (default: from config or 60000)
   * @returns Promise that resolves with the response message
   * @throws {TimeoutError} If response is not received within timeout
   * @throws {ValidationError} If message fails validation
   * @throws {MessageError} If message sending fails
   *
   * @example
   * ```typescript
   * const requestMessage = createRequestChallenge('user', walletAddress);
   * const response = await wsClient.sendMessageWithResponse(requestMessage, 30000);
   * console.log('Response received:', response);
   * ```
   */
  public async sendMessageWithResponse<T = any>(
    message: BaseMessage,
    timeout?: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      const messageWithId = { ...message, id: messageId };

      // Set timeout
      const timeoutMs = timeout || this.config.messageTimeout || TIMEOUTS.DEFAULT_MESSAGE_TIMEOUT;
      const timeoutHandle = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        reject(
          new TimeoutError(`Message timeout after ${timeoutMs}ms`, {
            messageId
          })
        );
      }, timeoutMs);

      // Store pending message
      this.pendingMessages.set(messageId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // Send message
      this.sendMessage(messageWithId).catch((error) => {
        this.pendingMessages.delete(messageId);
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Authenticate with the server
   */
  private async authenticate(): Promise<void> {
    if (!this.account && !this.config.walletAddress) {
      this.logger.info("No authentication configured, continuing without auth");
      this.updateAuthState({ authenticated: false });
      this.emit("ready");
      return;
    }

    try {
      // Check for cached authentication first
      if (this.config.walletAddress) {
        this.logger.debug("Checking cached authentication");
        await this.sendMessage(createCheckCachedAuth(this.config.walletAddress));

        // Wait briefly for cached auth response
        await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.CACHED_AUTH_WAIT));

        if (this.authState.authenticated) {
          this.logger.info("Using cached authentication");
          return;
        }
      }

      // Request challenge
      this.logger.debug("Requesting authentication challenge");
      await this.sendMessage(
        createRequestChallenge(
          this.config.clientType || "user",
          this.account?.address || this.config.walletAddress
        )
      );

      // Wait for authentication to complete
      await new Promise<void>((resolve, reject) => {
        let timeout: NodeJS.Timeout | undefined;
        const pollTimeouts: NodeJS.Timeout[] = [];

        // Centralized cleanup function - guarantees cleanup in all scenarios
        const cleanup = () => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
          }
          // Clear all polling timeouts
          pollTimeouts.forEach((t) => clearTimeout(t));
          pollTimeouts.length = 0;
        };

        // Set main authentication timeout
        timeout = setTimeout(() => {
          cleanup();
          reject(new AuthenticationError("Authentication timeout"));
        }, TIMEOUTS.AUTH_TIMEOUT);

        const checkAuth = () => {
          if (this.authState.authenticated) {
            cleanup();
            resolve();
          } else if (this.connectionState.lastError) {
            cleanup();
            reject(this.connectionState.lastError);
          } else {
            // Store polling timeout for cleanup
            const pollTimeout = setTimeout(checkAuth, TIMEOUTS.AUTH_POLL_INTERVAL);
            pollTimeouts.push(pollTimeout);
          }
        };

        checkAuth();
      });
    } catch (error) {
      this.logger.error("Authentication failed", error);
      throw new AuthenticationError("Failed to authenticate", error);
    }
  }

  /**
   * Create handler context with all dependencies
   */
  private createHandlerContext(): HandlerContext {
    return {
      emit: (event: string, ...args: any[]) => this.emit(event as any, ...args),
      sendWebhook: async () => {
        // Webhooks are handled by WebhookHandler in TeneoSDK
        // Handlers shouldn't call webhooks directly - they emit events
        // which are then forwarded to webhooks by MessageRouter
      },
      logger: this.logger,
      getConnectionState: () => this.getConnectionState(),
      getAuthState: () => this.getAuthState(),
      updateConnectionState: (update: any) => this.updateConnectionState(update),
      updateAuthState: (update: any) => this.updateAuthState(update),
      roomManager: this.roomManager,
      account: this.account,
      sendMessage: (message: BaseMessage) => this.sendMessage(message)
    };
  }

  /**
   * Handle incoming messages using the handler registry
   */
  private async handleMessage(message: BaseMessage): Promise<void> {
    this.logger.debug("Received message", { type: message.type });
    this.emit("message:received", message);

    // Check for duplicate messages (CB-4)
    if (this.deduplicationCache && message.id) {
      if (this.deduplicationCache.has(message.id)) {
        this.logger.debug("Duplicate message detected and skipped", {
          type: message.type,
          id: message.id
        });
        this.emit("message:duplicate", message);
        return;
      }
      // Add to deduplication cache
      this.deduplicationCache.add(message.id);
    }

    // Check for pending message response
    if (message.id && this.pendingMessages.has(message.id)) {
      const pending = this.pendingMessages.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(message.id);
      pending.resolve(message);
      return;
    }

    // Verify signature if enabled (SEC-2)
    const shouldProcess = await this.verifyMessageSignature(message);
    if (!shouldProcess) {
      this.logger.debug("Message rejected by signature verification", {
        type: message.type
      });
      return;
    }

    // Delegate to handler registry
    const context = this.createHandlerContext();
    this.handlerRegistry.handle(message, context).catch((error) => {
      this.logger.error("Error in message handler", error);
      this.emit("message:error", error, message);
    });
  }

  /**
   * Verify message signature if signature verification is enabled (SEC-2)
   * Returns true if message should be processed, false if it should be rejected
   */
  private async verifyMessageSignature(message: BaseMessage): Promise<boolean> {
    // Skip verification if disabled
    if (!this.signatureVerifier) {
      return true;
    }

    try {
      const result = await this.signatureVerifier.verify(message);

      if (result.signatureMissing) {
        // Signature is missing
        const isRequired = this.signatureVerifier.isSignatureRequired(message.type);
        this.emit("signature:missing", message.type, isRequired);

        if (!result.valid) {
          // Signature required but missing - reject message
          this.logger.warn("Message rejected: signature required but missing", {
            type: message.type,
            from: message.from
          });
          const error = new SignatureVerificationError(
            `Signature required for message type '${message.type}'`,
            {
              messageType: message.type,
              reason: "Signature missing"
            }
          );
          this.emit("message:error", error, message);
          return false;
        } else {
          // Signature not required - allow message
          this.logger.debug("Message accepted without signature", {
            type: message.type
          });
          return true;
        }
      }

      if (!result.valid) {
        // Signature is invalid
        this.logger.warn("Message rejected: invalid signature", {
          type: message.type,
          from: message.from,
          reason: result.reason
        });
        this.emit(
          "signature:failed",
          message.type,
          result.reason || "Invalid signature",
          result.recoveredAddress
        );

        const error = new SignatureVerificationError(
          `Signature verification failed for message type '${message.type}': ${result.reason}`,
          {
            messageType: message.type,
            recoveredAddress: result.recoveredAddress,
            reason: result.reason
          }
        );
        this.emit("message:error", error, message);
        return false;
      }

      // Signature is valid
      this.logger.debug("Message signature verified", {
        type: message.type,
        address: result.recoveredAddress,
        isTrusted: result.isTrusted
      });
      this.emit("signature:verified", message.type, result.recoveredAddress!);
      return true;
    } catch (error) {
      this.logger.error("Signature verification error", error);
      const verificationError = new SignatureVerificationError(
        `Signature verification error: ${error instanceof Error ? error.message : String(error)}`,
        {
          messageType: message.type,
          reason: error instanceof Error ? error.message : String(error)
        }
      );
      this.emit("message:error", verificationError, message);
      return false;
    }
  }

  /**
   * Handle reconnection logic with configurable retry strategy (REL-3)
   */
  private handleReconnection(): void {
    // Don't reconnect if disconnect was intentional
    if (this.intentionalDisconnect) {
      this.logger.debug("Skipping reconnection - disconnect was intentional");
      return;
    }

    if (!this.config.reconnect || this.connectionState.reconnecting) {
      return;
    }

    // Check if we should retry using the retry policy
    if (!this.reconnectPolicy.shouldRetry(this.connectionState.reconnectAttempts + 1)) {
      this.logger.error("Max reconnection attempts reached");
      this.emit("error", new ConnectionError("Max reconnection attempts reached"));
      return;
    }

    this.updateConnectionState({
      reconnecting: true,
      reconnectAttempts: this.connectionState.reconnectAttempts + 1
    });

    const delay = this.calculateReconnectDelay();
    this.logger.info(
      `Reconnecting in ${delay}ms (attempt ${this.connectionState.reconnectAttempts})`
    );
    this.emit("connection:reconnecting", this.connectionState.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.emit("connection:reconnected");
      } catch (error) {
        this.logger.error("Reconnection failed", error);
        this.handleReconnection();
      }
    }, delay);
  }

  /**
   * Calculate reconnection delay using retry policy (REL-3)
   */
  private calculateReconnectDelay(): number {
    return this.reconnectPolicy.calculateDelay(this.connectionState.reconnectAttempts);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(createPing()).catch((error) => {
          this.logger.error("Failed to send ping", error);
        });
      }
    }, TIMEOUTS.PING_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Process queued messages after reconnection
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    this.logger.info(`Processing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      this.sendMessage(message).catch((error) => {
        this.logger.error("Failed to send queued message", error);
        this.emit("message:error", error as Error, message);
      });
    }
  }

  /**
   * Update connection state with validation
   */
  private updateConnectionState(update: Partial<ConnectionState>): void {
    const newState = { ...this.connectionState, ...update };
    // Validate the new state
    this.connectionState = ConnectionStateSchema.parse(newState);
    this.emit("connection:state", this.connectionState);
  }

  /**
   * Update authentication state with validation
   */
  private updateAuthState(update: Partial<AuthenticationState>): void {
    const newState = { ...this.authState, ...update };
    // Validate the new state
    this.authState = AuthenticationStateSchema.parse(newState);
    this.emit("auth:state", this.authState);
  }

  /**
   * Create default logger using pino
   */
  private createDefaultLogger(): Logger {
    return createPinoLogger(this.config.logLevel || "info", "WebSocketClient");
  }

  // Getters
  /**
   * Quick check for whether the WebSocket connection is currently active.
   * This getter provides immediate connection status without full state details.
   *
   * @returns True if WebSocket is connected, false otherwise
   *
   * @example
   * ```typescript
   * if (wsClient.isConnected) {
   *   await wsClient.sendMessage(message);
   * }
   * ```
   */
  public get isConnected(): boolean {
    return this.connectionState.connected;
  }

  /**
   * Quick check for whether authentication is complete.
   * This getter provides immediate authentication status without full state details.
   *
   * @returns True if authenticated, false otherwise
   *
   * @example
   * ```typescript
   * if (wsClient.isAuthenticated) {
   *   console.log('Ready to communicate with agents');
   * }
   * ```
   */
  public get isAuthenticated(): boolean {
    return this.authState.authenticated;
  }

  /**
   * Gets a copy of the current connection state including detailed status information.
   * Returns a shallow copy to prevent external modification of internal state.
   *
   * @returns Copy of connection state with connection status, reconnection info, and timestamps
   *
   * @example
   * ```typescript
   * const state = wsClient.getConnectionState();
   * console.log(`Connected: ${state.connected}`);
   * console.log(`Reconnecting: ${state.reconnecting}`);
   * console.log(`Attempts: ${state.reconnectAttempts}`);
   * ```
   */
  public getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Gets a copy of the current authentication state including wallet and room information.
   * Returns a shallow copy to prevent external modification of internal state.
   *
   * @returns Copy of authentication state with wallet address, challenge, and room access
   *
   * @example
   * ```typescript
   * const authState = wsClient.getAuthState();
   * console.log(`Authenticated: ${authState.authenticated}`);
   * console.log(`Wallet: ${authState.walletAddress}`);
   * console.log(`Rooms: ${authState.rooms?.length}`);
   * ```
   */
  public getAuthState(): AuthenticationState {
    return { ...this.authState };
  }

  /**
   * Gets the current rate limiter status including available tokens and configuration.
   * Useful for monitoring rate limiting behavior and detecting potential throttling.
   * Returns undefined if rate limiting is not configured.
   *
   * @returns Rate limiter status object, or undefined if not configured
   * @returns {number} returns.availableTokens - Tokens currently available for consumption
   * @returns {number} returns.tokensPerSecond - Configured rate limit (operations per second)
   * @returns {number} returns.maxBurst - Maximum burst capacity
   *
   * @example
   * ```typescript
   * const status = wsClient.getRateLimiterStatus();
   * if (status) {
   *   console.log(`Available: ${status.availableTokens}/${status.maxBurst}`);
   *   console.log(`Rate: ${status.tokensPerSecond}/sec`);
   * }
   * ```
   */
  public getRateLimiterStatus():
    | {
        availableTokens: number;
        tokensPerSecond: number;
        maxBurst: number;
      }
    | undefined {
    if (!this.rateLimiter) {
      return undefined;
    }

    const config = this.rateLimiter.getConfig();
    return {
      availableTokens: this.rateLimiter.getAvailableTokens(),
      tokensPerSecond: config.tokensPerSecond,
      maxBurst: config.maxBurst
    };
  }

  /**
   * Gets the current message deduplication cache status (CB-4).
   * Useful for monitoring deduplication behavior and cache health.
   * Returns undefined if deduplication is not configured.
   *
   * @returns Deduplication cache status object, or undefined if not configured
   * @returns {number} returns.cacheSize - Number of message IDs currently cached
   * @returns {number} returns.ttl - Time-to-live for cache entries in milliseconds
   * @returns {number} returns.maxSize - Maximum cache size
   *
   * @example
   * ```typescript
   * const status = wsClient.getDeduplicationStatus();
   * if (status) {
   *   console.log(`Cache: ${status.cacheSize}/${status.maxSize}`);
   *   console.log(`TTL: ${status.ttl}ms`);
   * }
   * ```
   */
  public getDeduplicationStatus():
    | {
        cacheSize: number;
        ttl: number;
        maxSize: number;
      }
    | undefined {
    if (!this.deduplicationCache) {
      return undefined;
    }

    const config = this.deduplicationCache.getConfig();
    return {
      cacheSize: this.deduplicationCache.size(),
      ttl: config.ttl,
      maxSize: config.maxSize
    };
  }
}
