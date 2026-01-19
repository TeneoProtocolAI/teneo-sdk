/**
 * Types and interfaces for the Message Handler Registry pattern
 * Defines the contract for message handlers and their context
 */

import { z } from "zod";
import { BaseMessage, MessageType, Logger, WebhookEventType } from "../../types";
import { FormattedResponse } from "../../formatters/response-formatter";
import { PrivateKeyAccount } from "viem/accounts";
import type { RoomManager } from "../../managers/room-manager";
import type { RoomManagementManager } from "../../managers/room-management-manager";
import type { AgentRoomManager } from "../../managers/agent-room-manager";
import type { AdminManager } from "../../managers/admin-manager";
import type { AgentRegistry } from "../../managers/agent-registry";

// Re-export connection and auth state types from main config
// These types define the shape of state used by handlers
import type {
  ConnectionState as ConfigConnectionState,
  AuthenticationState as ConfigAuthenticationState
} from "../../types/config";

/** Connection state for the WebSocket client (re-exported from config) */
export type ConnectionState = ConfigConnectionState;

/** Authentication state (re-exported from config) */
export type AuthState = ConfigAuthenticationState;

/**
 * Context provided to message handlers
 * Contains all dependencies needed to handle messages
 */
export interface HandlerContext {
  // Event emission
  emit: (event: string, ...args: unknown[]) => void;

  // Webhook delivery
  sendWebhook: (
    type: WebhookEventType,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ) => Promise<void>;

  // Response formatting (optional)
  formatResponse?: (message: BaseMessage) => FormattedResponse;

  // Logging
  logger: Logger;

  // State access
  getConnectionState: () => ConnectionState;
  getAuthState: () => AuthState;
  updateConnectionState: (update: Partial<ConnectionState>) => void;
  updateAuthState: (update: Partial<AuthState>) => void;

  // Room manager for subscription updates (optional)
  roomManager?: RoomManager;

  // Room management manager for CRUD operations (v2.0.0, optional)
  roomManagementManager?: RoomManagementManager;

  // Agent room manager for agent-room operations (v2.0.0, optional)
  agentRoomManager?: AgentRoomManager;

  // Admin manager for admin-only features (optional)
  adminManager?: AdminManager;

  // Agent registry for agent details lookups (optional)
  agentRegistry?: AgentRegistry;

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
