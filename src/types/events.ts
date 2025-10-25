/**
 * Event schemas for Teneo Protocol SDK using Zod
 * Defines all events emitted by the SDK with runtime validation
 */

import { z } from "zod";
import {
  BaseMessageSchema,
  AgentSchema,
  RoomInfoSchema,
  TaskResponseMessageSchema,
  CapabilitySchema
} from "./messages";
import { ConnectionStateSchema, AuthenticationStateSchema } from "./config";
import { ErrorCode } from "./error-codes";

// Agent selected data schema
export const AgentSelectedDataSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  reasoning: z.string(),
  userRequest: z.string(),
  command: z.string().optional(),
  commandReasoning: z.string().optional(),
  capabilities: z.array(CapabilitySchema).optional()
});

// Agent response schema
export const AgentResponseSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  agentName: z.string().optional(),
  content: z.string(),
  contentType: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.date(),
  raw: TaskResponseMessageSchema.optional(),
  humanized: z.string().optional()
});

// SDK Error schema
export const SDKErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
  details: z.any().optional(),
  recoverable: z.boolean(),
  name: z.string()
});

// Specific error type schemas
export const ConnectionErrorSchema = SDKErrorSchema.extend({
  name: z.literal("ConnectionError")
});

export const AuthenticationErrorSchema = SDKErrorSchema.extend({
  name: z.literal("AuthenticationError"),
  recoverable: z.literal(false)
});

export const MessageErrorSchema = SDKErrorSchema.extend({
  name: z.literal("MessageError")
});

export const WebhookErrorSchema = SDKErrorSchema.extend({
  name: z.literal("WebhookError")
});

export const ValidationErrorSchema = SDKErrorSchema.extend({
  name: z.literal("ValidationError"),
  recoverable: z.literal(false)
});

export const TimeoutErrorSchema = SDKErrorSchema.extend({
  name: z.literal("TimeoutError")
});

export const RateLimitErrorSchema = SDKErrorSchema.extend({
  name: z.literal("RateLimitError"),
  details: z
    .object({
      retryAfter: z.number().optional()
    })
    .optional()
});

export const SignatureVerificationErrorSchema = SDKErrorSchema.extend({
  name: z.literal("SignatureVerificationError"),
  recoverable: z.literal(false),
  details: z
    .object({
      messageType: z.string().optional(),
      recoveredAddress: z.string().optional(),
      expectedAddress: z.string().optional(),
      reason: z.string().optional()
    })
    .optional()
});

export const ConfigurationErrorSchema = SDKErrorSchema.extend({
  name: z.literal("ConfigurationError"),
  recoverable: z.literal(false)
});

// Event metadata schema
export const EventMetadataSchema = z.object({
  event: z.string(),
  timestamp: z.date(),
  data: z.any().optional(),
  source: z.string().optional(),
  correlation_id: z.string().optional()
});

// Type inference
export type AgentSelectedData = z.infer<typeof AgentSelectedDataSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type EventMetadata = z.infer<typeof EventMetadataSchema>;

// Error classes that extend Error and implement Zod validation
export class SDKError extends Error {
  public code: string;
  public details?: any;
  public recoverable: boolean;

  constructor(message: string, code: ErrorCode, details?: any, recoverable: boolean = false) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.details = details;
    this.recoverable = recoverable;

    // Validate the error structure
    SDKErrorSchema.parse({
      message: this.message,
      code: this.code,
      details: this.details,
      recoverable: this.recoverable,
      name: this.name
    });
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      details: this.details
    };
  }
}

export class ConnectionError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.CONNECTION_ERROR, details, true);
    this.name = "ConnectionError";
  }
}

export class AuthenticationError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.AUTH_ERROR, details, false);
    this.name = "AuthenticationError";
  }
}

export class MessageError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.MESSAGE_ERROR, details, false);
    this.name = "MessageError";
  }
}

export class WebhookError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.WEBHOOK_ERROR, details, true);
    this.name = "WebhookError";
  }
}

export class ValidationError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.VALIDATION_ERROR, details, false);
    this.name = "ValidationError";
  }
}

export class TimeoutError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.TIMEOUT_ERROR, details, true);
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends SDKError {
  constructor(message: string, retryAfter?: number) {
    super(message, ErrorCode.RATE_LIMIT, { retryAfter }, true);
    this.name = "RateLimitError";
  }
}

/**
 * Error thrown when message signature verification fails.
 * Non-recoverable error that occurs when:
 * - A signature is required but missing
 * - A signature is invalid or doesn't match the message content
 * - The signing address is not in the trusted whitelist
 *
 * @example
 * ```typescript
 * sdk.on('message:error', (error) => {
 *   if (error instanceof SignatureVerificationError) {
 *     console.log('Signature verification failed:', error.details);
 *     // error.details.messageType - Type of message that failed
 *     // error.details.recoveredAddress - Address recovered from signature
 *     // error.details.reason - Specific reason for failure
 *   }
 * });
 * ```
 */
export class SignatureVerificationError extends SDKError {
  constructor(
    message: string,
    details?: {
      /** Type of message that failed verification */
      messageType?: string;
      /** Address recovered from the signature */
      recoveredAddress?: string;
      /** Expected address for verification */
      expectedAddress?: string;
      /** Specific reason why verification failed */
      reason?: string;
    }
  ) {
    super(message, ErrorCode.SIGNATURE_VERIFICATION_ERROR, details, false);
    this.name = "SignatureVerificationError";
  }
}

/**
 * Error thrown when SDK configuration is invalid.
 * Non-recoverable error that occurs when:
 * - Required configuration fields are missing
 * - Configuration values fail validation
 * - Configuration format is incorrect
 *
 * @example
 * ```typescript
 * try {
 *   const sdk = new TeneoSDK({ wsUrl: 'invalid-url' });
 * } catch (error) {
 *   if (error instanceof ConfigurationError) {
 *     console.log('Configuration error:', error.message);
 *   }
 * }
 * ```
 */
export class ConfigurationError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.CONFIG_ERROR, details, false);
    this.name = "ConfigurationError";
  }
}

// SDK Events interface with proper typing
export interface SDKEvents {
  // Connection events
  "connection:open": () => void;
  "connection:close": (code: number, reason: string) => void;
  "connection:error": (error: Error) => void;
  "connection:reconnecting": (attempt: number) => void;
  "connection:reconnected": () => void;
  "connection:state": (state: z.infer<typeof ConnectionStateSchema>) => void;

  // Authentication events
  "auth:challenge": (challenge: string) => void;
  "auth:required": () => void;
  "auth:success": (state: z.infer<typeof AuthenticationStateSchema>) => void;
  "auth:error": (error: string) => void;
  "auth:state": (state: z.infer<typeof AuthenticationStateSchema>) => void;

  // Signature verification events
  "signature:verified": (messageType: string, address: string) => void;
  "signature:failed": (messageType: string, reason: string, address?: string) => void;
  "signature:missing": (messageType: string, required: boolean) => void;

  // Message events
  "message:sent": (message: z.infer<typeof BaseMessageSchema>) => void;
  "message:received": (message: z.infer<typeof BaseMessageSchema>) => void;
  "message:duplicate": (message: z.infer<typeof BaseMessageSchema>) => void;
  "message:error": (error: Error, message?: z.infer<typeof BaseMessageSchema>) => void;

  // Agent events
  "agent:selected": (data: AgentSelectedData) => void;
  "agent:task": (taskId: string, content: string) => void;
  "agent:response": (response: AgentResponse) => void;
  "agent:list": (agents: z.infer<typeof AgentSchema>[]) => void;
  "agent:status": (agentId: string, status: "online" | "offline") => void;

  // Room events
  "room:subscribed": (data: { roomId: string; subscriptions: string[] }) => void;
  "room:unsubscribed": (data: { roomId: string; subscriptions: string[] }) => void;
  "room:message": (roomId: string, message: z.infer<typeof BaseMessageSchema>) => void;
  "room:list": (rooms: z.infer<typeof RoomInfoSchema>[]) => void;

  // Coordinator events
  "coordinator:processing": (userRequest: string) => void;
  "coordinator:selected": (agentId: string, reasoning: string) => void;
  "coordinator:error": (error: string) => void;

  // Webhook events
  "webhook:sent": (payload: any, url: string) => void;
  "webhook:success": (response: any, url: string) => void;
  "webhook:error": (error: Error, url: string) => void;
  "webhook:retry": (attempt: number, url: string) => void;

  // Error events
  error: (error: SDKError) => void;
  warning: (warning: string) => void;

  // Lifecycle events
  ready: () => void;
  disconnect: () => void;
  destroy: () => void;
}

// Event handler type helpers
export type EventHandler<T extends keyof SDKEvents> = SDKEvents[T];

export type EventMap = {
  [K in keyof SDKEvents]: Parameters<SDKEvents[K]>;
};

// Event emitter interface
export interface IEventEmitter {
  on<T extends keyof SDKEvents>(event: T, handler: SDKEvents[T]): void;
  once<T extends keyof SDKEvents>(event: T, handler: SDKEvents[T]): void;
  off<T extends keyof SDKEvents>(event: T, handler: SDKEvents[T]): void;
  emit<T extends keyof SDKEvents>(event: T, ...args: Parameters<SDKEvents[T]>): void;
  removeAllListeners(event?: keyof SDKEvents): void;
}

// Helper to validate event data
export function validateEventData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Safe parse event data
export function safeValidateEventData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; error?: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Check if an error is a recoverable SDKError
 * @param error - The error to check
 * @returns true if the error is a recoverable SDKError, false otherwise
 *
 * @example
 * ```typescript
 * try {
 *   await sdk.sendMessage("Hello");
 * } catch (error) {
 *   if (isRecoverableError(error)) {
 *     // Retry the operation
 *     console.log('Recoverable error, retrying...');
 *   } else {
 *     // Fatal error, don't retry
 *     console.error('Fatal error:', error);
 *   }
 * }
 * ```
 */
export function isRecoverableError(error: unknown): boolean {
  return error instanceof SDKError && error.recoverable;
}
