/**
 * Types and interfaces for the Message Handler Registry pattern
 * Defines the contract for message handlers and their context
 */

import { z } from "zod";
import { BaseMessage, MessageType, Logger, WebhookEventType } from "../../types";
import { FormattedResponse } from "../../formatters/response-formatter";
import { PrivateKeyAccount } from "viem/accounts";

/**
 * Context provided to message handlers
 * Contains all dependencies needed to handle messages
 */
export interface HandlerContext {
  // Event emission
  emit: (event: string, ...args: any[]) => void;

  // Webhook delivery
  sendWebhook: (type: WebhookEventType, data: any, metadata?: any) => Promise<void>;

  // Response formatting (optional)
  formatResponse?: (message: BaseMessage) => FormattedResponse;

  // Logging
  logger: Logger;

  // State access
  getConnectionState: () => any;
  getAuthState: () => any;
  updateConnectionState: (update: any) => void;
  updateAuthState: (update: any) => void;

  // Room manager for subscription updates (optional)
  roomManager?: any;

  // Account for signing (optional, for auth handlers)
  account?: PrivateKeyAccount;

  // Send message back to server
  sendMessage: (message: BaseMessage) => Promise<void>;
}

/**
 * Message handler interface
 * Each message type has a handler implementing this interface
 */
export interface MessageHandler<T extends BaseMessage = BaseMessage> {
  // Message type this handler processes
  readonly type: MessageType;

  // Zod schema for validation
  readonly schema: z.ZodSchema<T>;

  // Handle the message
  handle(message: BaseMessage, context: HandlerContext): Promise<void> | void;

  // Validate if this handler can handle a message
  canHandle(message: BaseMessage): boolean;
}

/**
 * Handler metadata for registration
 */
export interface HandlerMetadata {
  type: MessageType;
  description?: string;
  priority?: number; // For handler ordering (lower = higher priority)
}

/**
 * Handler registration options
 */
export interface HandlerRegistrationOptions {
  replace?: boolean; // Replace existing handler for this type
  priority?: number; // Handler priority
}
