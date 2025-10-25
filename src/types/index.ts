/**
 * Main type exports for Teneo Protocol SDK
 * Exports both Zod schemas and inferred TypeScript types
 */

// Message schemas and types
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

  // Base message schema
  BaseMessageSchema,

  // Authentication message schemas
  RequestChallengeMessageSchema,
  ChallengeMessageSchema,
  CheckCachedAuthMessageSchema,
  AuthRequiredMessageSchema,
  AuthMessageSchema,
  AuthSuccessMessageSchema,
  AuthErrorMessageSchema,

  // Registration message schemas
  RegisterMessageSchema,
  RegistrationSuccessMessageSchema,

  // Communication message schemas
  UserMessageSchema,
  TaskMessageSchema,
  TaskResponseMessageSchema,
  AgentSelectedMessageSchema,

  // System message schemas
  AgentsListMessageSchema,
  ErrorMessageSchema,
  PingMessageSchema,
  PongMessageSchema,

  // Room message schemas
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  ListRoomsMessageSchema,
  SubscribeResponseSchema,
  UnsubscribeResponseSchema,
  RoomInfoSchema,
  ListRoomsResponseSchema,

  // Union schema
  AnyMessageSchema,

  // TypeScript types
  type MessageType,
  type ContentType,
  type ClientType,
  type AgentType,
  type AgentStatus,
  type Capability,
  type Command,
  type Room,
  type Agent,
  type BaseMessage,
  type RequestChallengeMessage,
  type ChallengeMessage,
  type CheckCachedAuthMessage,
  type AuthRequiredMessage,
  type AuthMessage,
  type AuthSuccessMessage,
  type AuthErrorMessage,
  type RegisterMessage,
  type RegistrationSuccessMessage,
  type UserMessage,
  type TaskMessage,
  type TaskResponseMessage,
  type AgentSelectedMessage,
  type AgentsListMessage,
  type ErrorMessage,
  type PingMessage,
  type PongMessage,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type ListRoomsMessage,
  type SubscribeResponse,
  type UnsubscribeResponse,
  type RoomInfo,
  type ListRoomsResponse,
  type AnyMessage,

  // Type guards
  isAuthSuccess,
  isAuthError,
  isAuth,
  isChallenge,
  isAgentSelected,
  isTaskResponse,
  isError,
  isAgentsList,

  // Factory functions
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
} from "./messages";

// Configuration schemas and types
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
  type Logger,
  type LogLevel,
  type ResponseFormat,
  type WebhookEventType,
  type SDKConfig,
  type PartialSDKConfig,
  type ConnectionState,
  type AuthenticationState,
  type WebhookConfig,
  type WebhookPayload,

  // Constants and utilities
  DEFAULT_CONFIG,
  validateConfig,
  safeParseConfig,
  SDKConfigBuilder
} from "./config";

// Event schemas and types
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
  EventMetadataSchema,

  // Types
  type AgentSelectedData,
  type AgentResponse,
  type EventMetadata,
  type SDKEvents,
  type EventHandler,
  type EventMap,
  type IEventEmitter,

  // Error classes
  SDKError,
  ConnectionError,
  AuthenticationError,
  MessageError,
  WebhookError,
  ValidationError,
  TimeoutError,
  RateLimitError,

  // Validation helpers
  validateEventData,
  safeValidateEventData
} from "./events";

// Error codes
export { ErrorCode } from "./error-codes";

// Health status types
export { type HealthStatus } from "./health";
