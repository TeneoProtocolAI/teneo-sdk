/**
 * Configuration schemas for Teneo Protocol SDK using Zod
 * Provides runtime validation and TypeScript type inference
 */

import { z } from "zod";
import { ClientTypeSchema, RoomSchema, MessageTypeSchema, MessageType } from "./messages";
import { RetryStrategySchema, type RetryStrategy } from "../utils/retry-policy";
import type { SecurePrivateKey } from "../utils/secure-private-key";

// Logger interface
export interface Logger {
  debug: (message: string, data?: any) => void;
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, data?: any) => void;
}

// Logger schema - using loose function validation
export const LoggerSchema = z.object({
  debug: z.function(),
  info: z.function(),
  warn: z.function(),
  error: z.function()
}) as z.ZodType<Logger>;

// Log level schema
export const LogLevelSchema = z.enum(["debug", "info", "warn", "error", "silent"]);

// Response format schema
export const ResponseFormatSchema = z.enum(["raw", "humanized", "both"]);

// Webhook event type schema
export const WebhookEventTypeSchema = z.enum([
  "message",
  "task",
  "task_response",
  "agent_selected",
  "error",
  "connection_state",
  "auth_state"
]);

// Custom Zod schema for SecurePrivateKey or string
const PrivateKeySchema = z.union([
  z.string(),
  z.custom<SecurePrivateKey>(
    (val) => {
      // Check if it's a SecurePrivateKey instance
      return val && typeof val === 'object' && 'use' in val && 'destroy' in val && 'isDestroyed' in val;
    },
    { message: "Must be a string or SecurePrivateKey instance" }
  )
]);

// SDK Configuration schema
export const SDKConfigSchema = z.object({
  // WebSocket configuration
  wsUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("ws://") || url.startsWith("wss://"), {
      message: "WebSocket URL must start with ws:// or wss://"
    }),

  // Authentication
  privateKey: PrivateKeySchema.optional(),
  walletAddress: z.string().optional(),

  // Client identification
  clientType: ClientTypeSchema.optional(),
  clientName: z.string().optional(),

  // Room configuration
  autoJoinRooms: z.array(z.string()).optional(),

  // Webhook configuration
  webhookUrl: z.string().url().optional(),
  webhookHeaders: z.record(z.string()).optional(),
  webhookRetries: z.number().min(0).max(10).optional(),
  webhookTimeout: z.number().min(1000).max(60000).optional(),
  webhookRetryStrategy: RetryStrategySchema.optional(), // REL-3: Configurable retry strategy

  // Connection settings
  reconnect: z.boolean().optional(),
  reconnectDelay: z.number().min(100).max(60000).optional(),
  maxReconnectAttempts: z.number().min(0).max(100).optional(),
  connectionTimeout: z.number().min(1000).max(120000).optional(),
  reconnectStrategy: RetryStrategySchema.optional(), // REL-3: Configurable retry strategy

  // Message settings
  messageTimeout: z.number().min(1000).max(300000).optional(),
  maxMessageSize: z.number().min(1024).max(10485760).optional(), // 1KB to 10MB
  maxMessagesPerSecond: z.number().min(1).max(1000).optional(), // Rate limiting

  // Response formatting
  responseFormat: ResponseFormatSchema.optional(),
  includeMetadata: z.boolean().optional(),

  // Logging
  logLevel: LogLevelSchema.optional(),
  logger: LoggerSchema.optional(),

  // Performance
  enableCache: z.boolean().optional(),
  cacheTimeout: z.number().min(1000).max(3600000).optional(),
  maxCacheSize: z.number().min(1).max(10000).optional(),

  // Security
  validateSignatures: z.boolean().optional(),
  trustedAgentAddresses: z.array(z.string()).optional(),
  requireSignaturesFor: z.array(MessageTypeSchema).optional(),
  strictSignatureValidation: z.boolean().optional(),
  allowInsecureWebhooks: z.boolean().optional(),

  // Message deduplication (CB-4)
  enableMessageDeduplication: z.boolean().optional(),
  messageDedupeTtl: z.number().min(1000).max(3600000).optional(), // 1s to 1 hour
  messageDedupMaxSize: z.number().min(1).max(100000).optional()
});

// Partial config for constructor
export const PartialSDKConfigSchema = SDKConfigSchema.partial().refine(
  (config) => config.wsUrl !== undefined,
  { message: "WebSocket URL is required" }
);

// Connection state schema
export const ConnectionStateSchema = z.object({
  connected: z.boolean(),
  authenticated: z.boolean(),
  reconnecting: z.boolean(),
  reconnectAttempts: z.number(),
  lastError: z.instanceof(Error).optional(),
  lastConnectedAt: z.date().optional(),
  lastDisconnectedAt: z.date().optional()
});

// Authentication state schema
export const AuthenticationStateSchema = z.object({
  authenticated: z.boolean(),
  clientId: z.string().optional(),
  walletAddress: z.string().optional(),
  isWhitelisted: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  nftVerified: z.boolean().optional(),
  rooms: z.array(z.string()).optional(), // Room IDs for backward compatibility
  roomObjects: z.array(RoomSchema).optional(), // Full room objects from auth
  privateRoomId: z.string().optional(),
  challenge: z.string().optional(),
  challengeTimestamp: z.number().optional()
});

// Webhook config schema
export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  retries: z.number().min(0).max(10).optional(),
  timeout: z.number().min(1000).max(60000).optional(),
  events: z.array(WebhookEventTypeSchema).optional()
});

// Webhook payload schema
export const WebhookPayloadSchema = z.object({
  event: WebhookEventTypeSchema,
  timestamp: z.string(),
  data: z.any(),
  metadata: z
    .object({
      clientId: z.string().optional(),
      roomId: z.string().optional(),
      agentId: z.string().optional(),
      taskId: z.string().optional()
    })
    .optional()
});

// Type inference from schemas
export type LogLevel = z.infer<typeof LogLevelSchema>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
export type SDKConfig = z.infer<typeof SDKConfigSchema>;
export type PartialSDKConfig = z.infer<typeof PartialSDKConfigSchema>;
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
export type AuthenticationState = z.infer<typeof AuthenticationStateSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Re-export RetryStrategy for convenience
export type { RetryStrategy };

// Default configuration with validation
export const DEFAULT_CONFIG: PartialSDKConfig = SDKConfigSchema.partial().parse({
  wsUrl: "ws://localhost:8080/ws",
  clientType: "user",
  reconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10,
  connectionTimeout: 30000,
  messageTimeout: 30000,
  maxMessageSize: 2 * 1024 * 1024, // 2MB
  maxMessagesPerSecond: 10, // Rate limit: 10 messages per second
  responseFormat: "humanized",
  includeMetadata: false,
  logLevel: "info",
  enableCache: true,
  cacheTimeout: 300000, // 5 minutes
  maxCacheSize: 100,
  validateSignatures: false,
  trustedAgentAddresses: [],
  requireSignaturesFor: ["task_response", "agent_selected"],
  strictSignatureValidation: false,
  allowInsecureWebhooks: false,
  webhookRetries: 3,
  webhookTimeout: 10000,
  enableMessageDeduplication: true, // Enable by default to prevent duplicates
  messageDedupeTtl: 60000, // 60 seconds (1 minute)
  messageDedupMaxSize: 10000 // 10k messages
});

// Configuration validation with custom refinements
export function validateConfig(config: unknown): SDKConfig {
  // First validate basic structure
  const parsed = SDKConfigSchema.parse(config);

  // Additional custom validations
  if (parsed.webhookUrl && !parsed.allowInsecureWebhooks) {
    const url = new URL(parsed.webhookUrl);
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      throw new Error("Webhook URL must use HTTPS for non-localhost endpoints");
    }
  }

  return parsed;
}

// Safe parse configuration
export function safeParseConfig(config: unknown): {
  success: boolean;
  data?: SDKConfig;
  error?: z.ZodError | Error;
} {
  try {
    const data = validateConfig(config);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    return { success: false, error: error as Error };
  }
}

/**
 * Fluent API builder for creating Teneo SDK configurations with validation.
 * Provides a chainable interface for configuring the SDK with runtime validation
 * at each step. Call `.build()` to create the final validated configuration.
 *
 * This is the recommended way to configure the SDK for complex setups, as it provides
 * better IDE intellisense, method chaining, and validates each configuration option
 * as you set it.
 *
 * @example
 * ```typescript
 * // Basic configuration
 * const config = new SDKConfigBuilder()
 *   .withWebSocketUrl('wss://teneo.example.com')
 *   .withAuthentication('0x...')
 *   .build();
 *
 * const sdk = new TeneoSDK(config);
 *
 * // Full configuration with all options
 * const config = new SDKConfigBuilder()
 *   .withWebSocketUrl('wss://teneo.example.com')
 *   .withAuthentication('0x...', '0xYourWalletAddress')
 *   .withAutoJoinRooms(['general', 'announcements'])
 *   .withWebhook('https://api.example.com/webhooks', {
 *     'Authorization': 'Bearer token'
 *   })
 *   .withReconnection(true, 5000, 10)
 *   .withResponseFormat({ format: 'both', includeMetadata: true })
 *   .withLogging('debug')
 *   .withCache(true, 300000, 100)
 *   .build();
 *
 * const sdk = new TeneoSDK(config);
 *
 * // Using via TeneoSDK.builder() (recommended)
 * const sdk = TeneoSDK.builder()
 *   .withWebSocketUrl('wss://teneo.example.com')
 *   .withAuthentication('0x...')
 *   .withAutoJoinRooms(['general'])
 *   .build();
 * ```
 *
 * @see {@link TeneoSDK} for the main SDK class
 * @see {@link TeneoSDK.builder} for creating a builder instance
 */
export class SDKConfigBuilder {
  private config: PartialSDKConfig = { ...DEFAULT_CONFIG };

  /**
   * Sets the WebSocket URL for connecting to the Teneo network.
   * URL must start with 'ws://' or 'wss://'. HTTPS (wss://) is recommended for production.
   *
   * @param url - WebSocket URL (e.g., 'wss://teneo.example.com')
   * @returns this builder for method chaining
   * @throws {z.ZodError} If URL is invalid or doesn't start with ws:// or wss://
   *
   * @example
   * ```typescript
   * builder.withWebSocketUrl('wss://teneo.example.com')
   * ```
   */
  withWebSocketUrl(url: string): this {
    const parsed = z
      .string()
      .url()
      .refine((u) => u.startsWith("ws://") || u.startsWith("wss://"), {
        message: "WebSocket URL must start with ws:// or wss://"
      })
      .parse(url);
    this.config.wsUrl = parsed;
    return this;
  }

  /**
   * Configures Ethereum wallet-based authentication credentials.
   * Private key is used to sign authentication challenges from the server.
   * Wallet address is optional and will be derived from the private key if not provided.
   *
   * For enhanced security (SEC-3), you can pass a SecurePrivateKey instance to keep
   * the private key encrypted in memory from the start.
   *
   * @param privateKey - Ethereum private key (hex string starting with 0x) or SecurePrivateKey instance
   * @param walletAddress - Optional wallet address (will be derived if not provided)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If privateKey or walletAddress is invalid
   *
   * @example
   * ```typescript
   * // With private key string only (address derived automatically)
   * builder.withAuthentication('0x...')
   *
   * // With explicit wallet address
   * builder.withAuthentication('0x...privatekey', '0x...address')
   *
   * // With SecurePrivateKey for enhanced security (SEC-3)
   * const secureKey = new SecurePrivateKey('0x...');
   * builder.withAuthentication(secureKey, '0x...address')
   * ```
   */
  withAuthentication(privateKey: string | SecurePrivateKey, walletAddress?: string): this {
    this.config.privateKey = PrivateKeySchema.parse(privateKey);
    if (walletAddress) {
      this.config.walletAddress = z.string().parse(walletAddress);
    }
    return this;
  }

  /**
   * Configures webhook URL and optional HTTP headers for receiving real-time event notifications.
   * Webhook URL must use HTTPS for non-localhost endpoints (security requirement).
   * Events are sent via HTTP POST requests with JSON payloads.
   *
   * @param url - Webhook endpoint URL (must be HTTPS unless localhost)
   * @param headers - Optional HTTP headers to include with webhook requests (e.g., Authorization)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If URL is invalid
   *
   * @example
   * ```typescript
   * // Basic webhook
   * builder.withWebhook('https://api.example.com/webhooks/teneo')
   *
   * // With authentication headers
   * builder.withWebhook('https://api.example.com/webhooks', {
   *   'Authorization': 'Bearer your-token',
   *   'X-Custom-Header': 'value'
   * })
   * ```
   */
  withWebhook(url: string, headers?: Record<string, string>): this {
    this.config.webhookUrl = z.string().url().parse(url);
    if (headers) {
      this.config.webhookHeaders = z.record(z.string()).parse(headers);
    }
    return this;
  }

  /**
   * Configures rooms to automatically subscribe to after authentication.
   * These rooms will be subscribed to automatically when connection is established.
   *
   * @param rooms - Array of room IDs to auto-subscribe to on connection
   * @returns this builder for method chaining
   * @throws {z.ZodError} If room IDs are invalid
   *
   * @example
   * ```typescript
   * builder.withAutoJoinRooms(['general', 'announcements', 'support'])
   * ```
   */
  withAutoJoinRooms(rooms: string[]): this {
    this.config.autoJoinRooms = z.array(z.string()).parse(rooms);
    return this;
  }

  /**
   * Configures automatic reconnection behavior for WebSocket connections.
   * When enabled, SDK will automatically attempt to reconnect on disconnection.
   * Uses exponential backoff strategy for reconnection attempts.
   *
   * @param optionsOrEnabled - Reconnection configuration options object, or boolean for backwards compatibility
   * @param delay - (Deprecated positional arg) Delay between reconnection attempts in ms
   * @param maxAttempts - (Deprecated positional arg) Maximum reconnection attempts
   * @returns this builder for method chaining
   * @throws {z.ZodError} If options are out of valid range
   *
   * @example
   * ```typescript
   * // New API with object (recommended)
   * builder.withReconnection({ enabled: true })
   * builder.withReconnection({
   *   enabled: true,
   *   delay: 3000,
   *   maxAttempts: 5
   * })
   *
   * // Old API with positional args (backwards compatible)
   * builder.withReconnection(true, 3000, 5)
   * ```
   */
  withReconnection(
    optionsOrEnabled: { enabled?: boolean; delay?: number; maxAttempts?: number } | boolean,
    delay?: number,
    maxAttempts?: number
  ): this {
    // Handle backwards compatible positional arguments
    if (typeof optionsOrEnabled === "boolean") {
      this.config.reconnect = z.boolean().parse(optionsOrEnabled);
      if (delay !== undefined) {
        this.config.reconnectDelay = z.number().min(100).max(60000).parse(delay);
      }
      if (maxAttempts !== undefined) {
        this.config.maxReconnectAttempts = z.number().min(0).max(100).parse(maxAttempts);
      }
    } else {
      // New object API
      const options = optionsOrEnabled;
      if (options.enabled !== undefined) {
        this.config.reconnect = z.boolean().parse(options.enabled);
      }
      if (options.delay !== undefined) {
        this.config.reconnectDelay = z.number().min(100).max(60000).parse(options.delay);
      }
      if (options.maxAttempts !== undefined) {
        this.config.maxReconnectAttempts = z.number().min(0).max(100).parse(options.maxAttempts);
      }
    }
    return this;
  }

  /**
   * Configures how agent responses are formatted when received.
   * Choose between raw JSON, human-readable text, or both formats.
   * Metadata includes timestamps, agent info, and other contextual data.
   *
   * @param optionsOrFormat - Response format configuration object, or format string for backwards compatibility
   * @param includeMetadata - (Deprecated positional arg) Include metadata in responses
   * @returns this builder for method chaining
   * @throws {z.ZodError} If format is invalid
   *
   * @example
   * ```typescript
   * // New API with object (recommended)
   * builder.withResponseFormat({ format: 'humanized' })
   * builder.withResponseFormat({
   *   format: 'both',
   *   includeMetadata: true
   * })
   *
   * // Old API with positional args (backwards compatible)
   * builder.withResponseFormat('humanized', true)
   * ```
   */
  withResponseFormat(
    optionsOrFormat: { format?: ResponseFormat; includeMetadata?: boolean } | ResponseFormat,
    includeMetadata?: boolean
  ): this {
    // Handle backwards compatible positional arguments
    if (typeof optionsOrFormat === "string") {
      this.config.responseFormat = ResponseFormatSchema.parse(optionsOrFormat);
      if (includeMetadata !== undefined) {
        this.config.includeMetadata = z.boolean().parse(includeMetadata);
      }
    } else {
      // New object API
      const options = optionsOrFormat;
      if (options.format !== undefined) {
        this.config.responseFormat = ResponseFormatSchema.parse(options.format);
      }
      if (options.includeMetadata !== undefined) {
        this.config.includeMetadata = z.boolean().parse(options.includeMetadata);
      }
    }
    return this;
  }

  /**
   * Configures logging level and optionally provides a custom logger implementation.
   * Default logger uses pino with pretty printing in development and JSON in production.
   * Custom logger must implement the Logger interface (debug, info, warn, error methods).
   *
   * @param level - Log level: 'debug', 'info', 'warn', 'error', or 'silent' (default: 'info')
   * @param logger - Optional custom logger implementation
   * @returns this builder for method chaining
   * @throws {z.ZodError} If level is invalid or logger doesn't implement required interface
   *
   * @example
   * ```typescript
   * // Set log level only (uses default pino logger)
   * builder.withLogging('debug')
   *
   * // With custom logger
   * const customLogger = {
   *   debug: (msg, data) => console.debug(msg, data),
   *   info: (msg, data) => console.info(msg, data),
   *   warn: (msg, data) => console.warn(msg, data),
   *   error: (msg, data) => console.error(msg, data)
   * };
   * builder.withLogging('info', customLogger)
   *
   * // Silent mode (no logs)
   * builder.withLogging('silent')
   * ```
   */
  withLogging(level: LogLevel, logger?: Logger): this {
    this.config.logLevel = LogLevelSchema.parse(level);
    if (logger) {
      this.config.logger = LoggerSchema.parse(logger);
    }
    return this;
  }

  /**
   * Configures agent caching for improved performance.
   * Cache stores agent information to reduce lookup overhead.
   * Automatically invalidates stale entries based on timeout.
   *
   * @param enabled - Enable/disable agent caching (default: true)
   * @param timeout - Cache entry timeout in ms (default: 300000 / 5 minutes, range: 1000-3600000)
   * @param maxSize - Maximum cache size (default: 100, range: 1-10000)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If timeout or maxSize are out of valid range
   *
   * @example
   * ```typescript
   * // Enable with defaults
   * builder.withCache(true)
   *
   * // Custom cache settings
   * builder.withCache(true, 600000, 500)  // 10 minutes, 500 entries
   *
   * // Disable caching
   * builder.withCache(false)
   * ```
   */
  withCache(enabled: boolean, timeout?: number, maxSize?: number): this {
    this.config.enableCache = z.boolean().parse(enabled);
    if (timeout !== undefined) {
      this.config.cacheTimeout = z.number().min(1000).max(3600000).parse(timeout);
    }
    if (maxSize !== undefined) {
      this.config.maxCacheSize = z.number().min(1).max(10000).parse(maxSize);
    }
    return this;
  }

  /**
   * Configures message signature verification for security (SEC-2).
   * Verifies Ethereum ECDSA signatures on incoming messages to prevent spoofing attacks.
   * Disabled by default for backwards compatibility.
   *
   * @param options - Signature verification configuration
   * @param options.enabled - Enable/disable signature verification (default: false)
   * @param options.trustedAddresses - Whitelist of trusted agent addresses (empty = allow all)
   * @param options.requireFor - Message types that require signatures (default: ['task_response', 'agent_selected'])
   * @param options.strictMode - Reject all unsigned messages vs just critical ones (default: false)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If options are invalid
   *
   * @example
   * ```typescript
   * // Enable with defaults (verify but allow unsigned non-critical messages)
   * builder.withSignatureVerification({ enabled: true })
   *
   * // Enable with trusted address whitelist
   * builder.withSignatureVerification({
   *   enabled: true,
   *   trustedAddresses: ['0xAgent1...', '0xAgent2...']
   * })
   *
   * // Strict mode (reject all unsigned messages)
   * builder.withSignatureVerification({
   *   enabled: true,
   *   strictMode: true,
   *   requireFor: ['task_response', 'agent_selected', 'message']
   * })
   * ```
   */
  withSignatureVerification(options: {
    enabled?: boolean;
    trustedAddresses?: string[];
    requireFor?: MessageType[];
    strictMode?: boolean;
  }): this {
    const { enabled, trustedAddresses, requireFor, strictMode } = options;

    if (enabled !== undefined) {
      this.config.validateSignatures = z.boolean().parse(enabled);
    }
    if (trustedAddresses !== undefined) {
      this.config.trustedAgentAddresses = z.array(z.string()).parse(trustedAddresses);
    }
    if (requireFor !== undefined) {
      this.config.requireSignaturesFor = z.array(MessageTypeSchema).parse(requireFor);
    }
    if (strictMode !== undefined) {
      this.config.strictSignatureValidation = z.boolean().parse(strictMode);
    }

    return this;
  }

  /**
   * Configures WebSocket reconnection retry strategy (REL-3).
   * Allows full control over retry behavior: exponential, linear, or constant backoff.
   * If not specified, uses exponential backoff with default parameters for backward compatibility.
   *
   * @param strategy - Partial retry strategy configuration (unspecified fields use defaults)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If strategy parameters are invalid
   *
   * @example
   * ```typescript
   * // Exponential backoff with aggressive multiplier
   * builder.withReconnectionStrategy({
   *   type: 'exponential',
   *   baseDelay: 3000,
   *   maxDelay: 120000,
   *   maxAttempts: 20,
   *   jitter: true,
   *   backoffMultiplier: 3
   * })
   *
   * // Linear backoff for predictable delays
   * builder.withReconnectionStrategy({
   *   type: 'linear',
   *   baseDelay: 5000,
   *   maxDelay: 60000,
   *   maxAttempts: 10,
   *   jitter: false
   * })
   *
   * // Constant delay (useful for testing)
   * builder.withReconnectionStrategy({
   *   type: 'constant',
   *   baseDelay: 10000,
   *   maxDelay: 10000,
   *   maxAttempts: 5,
   *   jitter: false
   * })
   * ```
   */
  withReconnectionStrategy(strategy: Partial<RetryStrategy>): this {
    // Merge with defaults to allow partial strategy specification
    const fullStrategy: RetryStrategy = {
      type: strategy.type || "exponential",
      baseDelay: strategy.baseDelay !== undefined ? strategy.baseDelay : 5000,
      maxDelay: strategy.maxDelay !== undefined ? strategy.maxDelay : 60000,
      maxAttempts: strategy.maxAttempts !== undefined ? strategy.maxAttempts : 10,
      jitter: strategy.jitter !== undefined ? strategy.jitter : true,
      backoffMultiplier: strategy.backoffMultiplier
    };

    // Validate with schema
    this.config.reconnectStrategy = RetryStrategySchema.parse(fullStrategy);
    return this;
  }

  /**
   * Configures webhook delivery retry strategy (REL-3).
   * Allows full control over retry behavior: exponential, linear, or constant backoff.
   * If not specified, uses exponential backoff with default parameters for backward compatibility.
   *
   * @param strategy - Partial retry strategy configuration (unspecified fields use defaults)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If strategy parameters are invalid
   *
   * @example
   * ```typescript
   * // Exponential backoff without jitter
   * builder.withWebhookRetryStrategy({
   *   type: 'exponential',
   *   baseDelay: 1000,
   *   maxDelay: 30000,
   *   maxAttempts: 5,
   *   jitter: false,
   *   backoffMultiplier: 2
   * })
   *
   * // Linear backoff with jitter to spread load
   * builder.withWebhookRetryStrategy({
   *   type: 'linear',
   *   baseDelay: 2000,
   *   maxDelay: 20000,
   *   maxAttempts: 3,
   *   jitter: true
   * })
   * ```
   */
  withWebhookRetryStrategy(strategy: Partial<RetryStrategy>): this {
    // Merge with defaults to allow partial strategy specification
    const fullStrategy: RetryStrategy = {
      type: strategy.type || "exponential",
      baseDelay: strategy.baseDelay !== undefined ? strategy.baseDelay : 1000,
      maxDelay: strategy.maxDelay !== undefined ? strategy.maxDelay : 30000,
      maxAttempts: strategy.maxAttempts !== undefined ? strategy.maxAttempts : 3,
      jitter: strategy.jitter !== undefined ? strategy.jitter : false,
      backoffMultiplier: strategy.backoffMultiplier
    };

    // Validate with schema
    this.config.webhookRetryStrategy = RetryStrategySchema.parse(fullStrategy);
    return this;
  }

  /**
   * Configures message deduplication to prevent duplicate processing (CB-4).
   * Uses TTL-based cache to track recently processed message IDs.
   * Automatically expires entries to prevent unbounded memory growth.
   * Enabled by default with sensible limits for most use cases.
   *
   * @param enabled - Enable/disable message deduplication (default: true)
   * @param ttl - How long to remember message IDs in milliseconds (default: 60000 / 1 minute, range: 1000-3600000)
   * @param maxSize - Maximum cache size (default: 10000, range: 1-100000)
   * @returns this builder for method chaining
   * @throws {z.ZodError} If ttl or maxSize are out of valid range
   *
   * @example
   * ```typescript
   * // Enable with defaults (60s TTL, 10k cache)
   * builder.withMessageDeduplication(true)
   *
   * // Custom settings for high-volume scenarios
   * builder.withMessageDeduplication(true, 120000, 50000)  // 2 minutes, 50k entries
   *
   * // Disable deduplication (not recommended for production)
   * builder.withMessageDeduplication(false)
   * ```
   */
  withMessageDeduplication(enabled: boolean, ttl?: number, maxSize?: number): this {
    this.config.enableMessageDeduplication = z.boolean().parse(enabled);
    if (ttl !== undefined) {
      this.config.messageDedupeTtl = z.number().min(1000).max(3600000).parse(ttl);
    }
    if (maxSize !== undefined) {
      this.config.messageDedupMaxSize = z.number().min(1).max(100000).parse(maxSize);
    }
    return this;
  }

  /**
   * Builds and validates the final SDK configuration.
   * Performs comprehensive validation including custom refinements (e.g., webhook security).
   * Must be called after setting all desired configuration options.
   *
   * @returns Validated SDK configuration ready to pass to TeneoSDK constructor
   * @throws {Error} If configuration is invalid or fails validation
   * @throws {z.ZodError} If required fields are missing or values are out of range
   *
   * @example
   * ```typescript
   * const config = new SDKConfigBuilder()
   *   .withWebSocketUrl('wss://teneo.example.com')
   *   .withAuthentication('0x...')
   *   .withAutoJoinRooms(['general'])
   *   .build();  // Validates and returns final config
   *
   * const sdk = new TeneoSDK(config);
   * ```
   */
  build(): SDKConfig {
    // Validate and return complete config
    return validateConfig(this.config);
  }
}
