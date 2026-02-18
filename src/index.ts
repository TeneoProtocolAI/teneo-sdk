/**
 * Teneo Protocol SDK
 * TypeScript SDK for external platforms to interact with Teneo agents
 * Uses Zod for runtime validation and type safety
 *
 * @packageDocumentation
 */

/**
 * Main SDK class for interacting with Teneo agents
 * @see {@link TeneoSDK}
 */
export { TeneoSDK, SendMessageOptionsSchema, AgentCommandSchema } from "./teneo-sdk";
import { TeneoSDK } from "./teneo-sdk";
import { PartialSDKConfig } from "./types";

/**
 * Configuration types, schemas, and builders
 * Use SDKConfigBuilder for fluent configuration API
 */
export {
  // Schemas
  LoggerSchema,
  LogLevelSchema,
  ResponseFormatSchema,
  WebhookEventTypeSchema,
  SDKConfigSchema,
  PartialSDKConfigSchema,
  ConnectionStateSchema,
  AuthenticationStateSchema,
  WebhookConfigSchema,
  WebhookPayloadSchema,

  // Types
  SDKConfig,
  PartialSDKConfig,
  SDKConfigBuilder,
  Logger,
  LogLevel,
  ResponseFormat,
  ConnectionState,
  AuthenticationState,
  WebhookConfig,
  WebhookEventType,
  WebhookPayload,

  // Utilities
  DEFAULT_CONFIG,
  validateConfig,
  safeParseConfig
} from "./types/config";

/**
 * Health monitoring types for SDK component status
 * @see {@link TeneoSDK.getHealth}
 */
export { type HealthStatus } from "./types/health";

/**
 * Message types, schemas, and utilities
 * All WebSocket message types with Zod validation
 */
export {
  // Enum schemas
  MessageTypeSchema,
  ContentTypeSchema,
  ClientTypeSchema,
  AgentTypeSchema,
  AgentStatusSchema,

  // Supporting schemas
  CapabilitySchema,
  CommandSchema,
  RoomSchema,
  AgentSchema,

  // Message schemas
  BaseMessageSchema,
  RequestChallengeMessageSchema,
  ChallengeMessageSchema,
  CheckCachedAuthMessageSchema,
  AuthMessageSchema,
  AuthSuccessMessageSchema,
  AuthErrorMessageSchema,
  RegisterMessageSchema,
  RegistrationSuccessMessageSchema,
  UserMessageSchema,
  TaskMessageSchema,
  TaskResponseMessageSchema,
  AgentSelectedMessageSchema,
  AgentsListMessageSchema,
  ErrorMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  ListRoomsMessageSchema,
  SubscribeResponseSchema,
  UnsubscribeResponseSchema,
  RoomInfoSchema,
  ListRoomsResponseSchema,
  AnyMessageSchema,

  // Types
  MessageType,
  ContentType,
  ClientType,
  AgentType,
  AgentStatus,
  BaseMessage,
  RequestChallengeMessage,
  ChallengeMessage,
  CheckCachedAuthMessage,
  AuthMessage,
  AuthSuccessMessage,
  AuthErrorMessage,
  RegisterMessage,
  RegistrationSuccessMessage,
  UserMessage,
  TaskMessage,
  TaskResponseMessage,
  AgentSelectedMessage,
  AgentsListMessage,
  ErrorMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  ListRoomsMessage,
  SubscribeResponse,
  UnsubscribeResponse,
  RoomInfo,
  ListRoomsResponse,
  AnyMessage,
  Room,
  Capability,
  Command,
  Agent,

  // Type guards
  isAuthSuccess,
  isAuthError,
  isAuth,
  isChallenge,
  isAgentSelected,
  isTaskResponse,
  isError,
  isAgentsList,

  // Message factories
  createRequestChallenge,
  createCheckCachedAuth,
  createAuth,
  createUserMessage,
  createPing,
  createSubscribe,
  createUnsubscribe,
  createListRooms,

  // Validation helpers
  validateMessage,
  safeParseMessage
} from "./types/messages";

/**
 * Event types, error classes, and event handling utilities
 * Comprehensive typed event system for SDK lifecycle
 */
export {
  // Schemas
  AgentSelectedDataSchema,
  AgentResponseSchema,
  SDKErrorSchema,
  ConnectionErrorSchema,
  AuthenticationErrorSchema,
  MessageErrorSchema,
  WebhookErrorSchema,
  ValidationErrorSchema,
  TimeoutErrorSchema,
  RateLimitErrorSchema,
  SignatureVerificationErrorSchema,
  ConfigurationErrorSchema,
  EventMetadataSchema,

  // Types
  SDKEvents,
  AgentSelectedData,
  AgentResponse,
  EventMetadata,
  EventHandler,
  EventMap,
  IEventEmitter,

  // Error classes
  SDKError,
  ConnectionError,
  AuthenticationError,
  MessageError,
  WebhookError,
  ValidationError,
  TimeoutError,
  RateLimitError,
  SignatureVerificationError,
  ConfigurationError,
  PaymentError,

  // Validation helpers
  validateEventData,
  safeValidateEventData,
  isRecoverableError
} from "./types/events";

/**
 * Response formatting utilities for agent responses
 * Supports raw JSON, humanized text, or both formats
 */
export {
  // Schemas
  FormatOptionSchema,
  ResponseMetadataSchema,
  FormattedResponseSchema,

  // Types and classes
  ResponseFormatter,
  FormattedResponse,
  ResponseMetadata,
  FormatOption
} from "./formatters/response-formatter";

/**
 * Security utilities for private key management
 * SEC-3: In-memory encryption for private keys
 */
export { SecurePrivateKey } from "./utils/secure-private-key";

/**
 * Payment utilities for x402 payment signing
 * Enables SDK users to make payments directly using private keys
 */
export {
  PaymentClient,
  type PaymentClientConfig,
  PEAQ_CHAIN_ID,
  USDC_CONTRACT,
  DEFAULT_PAY_TO_ADDRESS,
  USDC_DECIMALS,
  X402_VERSION,
  DEFAULT_PAYMENT_TIMEOUT_SECONDS,
  buildX402ResourceUrl,
  usdcToUnits,
  unitsToUsdc,
  // Multi-network support (v2.3.0)
  type NetworkConfig,
  NETWORKS,
  CHAIN_ID_TO_NETWORK,
  CAIP2_TO_NETWORK,
  getNetwork,
  getDefaultNetwork,
  createChainDefinition,
  isNetworkSupported,
  getSupportedNetworks
} from "./payments";

/**
 * SDK version string
 */
export const VERSION = "3.0.1";

/**
 * Convenience type re-exports for message operations
 * @see {@link TeneoSDK.sendMessage}
 * @see {@link TeneoSDK.sendDirectCommand}
 */
export type { SendMessageOptions, AgentCommand } from "./teneo-sdk";

/**
 * Quick start function to create and connect SDK
 *
 * @example
 * ```typescript
 * import { createTeneoSDK } from '@teneo-protocol/sdk';
 *
 * const sdk = await createTeneoSDK({
 *   wsUrl: 'ws://localhost:8080/ws',
 *   privateKey: 'your-private-key',
 *   autoJoinPublicRooms: ['room-id-1']
 * });
 * ```
 */
export async function createTeneoSDK(config: PartialSDKConfig): Promise<TeneoSDK> {
  const { TeneoSDK } = await import("./teneo-sdk");
  const sdk = new TeneoSDK(config);
  await sdk.connect();
  return sdk;
}

// Default export for convenience
export default TeneoSDK;
