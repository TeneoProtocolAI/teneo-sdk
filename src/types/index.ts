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
  CommandPricingSchema,
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

  // Quote-Approve Flow schemas (v2.2.0)
  PricingInfoSchema,
  RequestTaskMessageSchema,
  TaskQuoteMessageSchema,
  ConfirmTaskMessageSchema,

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

  // Room Management schemas (v2.0.0)
  CreateRoomMessageSchema,
  UpdateRoomMessageSchema,
  DeleteRoomMessageSchema,
  RoomOperationResponseSchema,
  RoomMemberInfoSchema,
  AddRoomMemberMessageSchema,
  RemoveRoomMemberMessageSchema,
  ListRoomMembersMessageSchema,
  RoomMembersResponseSchema,
  RoomMemberOperationResponseSchema,

  // Agent Room Management schemas (v2.0.0)
  AgentRoomInfoSchema,
  AddAgentToRoomMessageSchema,
  RemoveAgentFromRoomMessageSchema,
  ListRoomAgentsMessageSchema,
  ListAvailableAgentsMessageSchema,
  AgentStatusUpdateMessageSchema,
  RoomAgentsResponseSchema,
  AvailableAgentsResponseSchema,
  AgentRoomOperationResponseSchema,

  // Room Ping schemas (v2.0.0)
  RoomPingMessageSchema,
  RoomPongResponseSchema,

  // Union schema
  AnyMessageSchema,

  // TypeScript types
  type MessageType,
  type ContentType,
  type ClientType,
  type AgentType,
  type AgentStatus,
  type Capability,
  type CommandPricing,
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

  // Quote-Approve Flow types (v2.2.0)
  type PricingInfo,
  type RequestTaskMessage,
  type TaskQuoteMessage,
  type ConfirmTaskMessage,
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

  // Room Management types (v2.0.0)
  type CreateRoomMessage,
  type UpdateRoomMessage,
  type DeleteRoomMessage,
  type RoomOperationResponse,
  type RoomMemberInfo,
  type AddRoomMemberMessage,
  type RemoveRoomMemberMessage,
  type ListRoomMembersMessage,
  type RoomMembersResponse,
  type RoomMemberOperationResponse,

  // Agent Room Management types (v2.0.0)
  type AgentRoomInfo,
  type AddAgentToRoomMessage,
  type RemoveAgentFromRoomMessage,
  type ListRoomAgentsMessage,
  type ListAvailableAgentsMessage,
  type AgentStatusUpdateMessage,
  type RoomAgentsResponse,
  type AvailableAgentsResponse,
  type AgentRoomOperationResponse,

  // Room Ping types (v2.0.0)
  type RoomPingMessage,
  type RoomPongResponse,

  // Admin types
  AdminAgentInfoSchema,
  ListAllAgentsMessageSchema,
  AllAgentsResponseSchema,
  UserCountDataSchema,
  UserCountMessageSchema,
  UserAuthenticatedMessageSchema,
  RateLimitNotificationMessageSchema,
  GetAgentDetailsMessageSchema,
  AgentDetailsResponseMessageSchema,
  type AdminAgentInfo,
  type ListAllAgentsMessage,
  type AllAgentsResponse,
  type UserCountData,
  type UserCountMessage,
  type UserAuthenticatedMessage,
  type RateLimitNotificationMessage,
  type GetAgentDetailsMessage,
  type AgentDetailsResponseMessage,

  // User Preferences types
  SetUserPreferencesDataSchema,
  SetUserPreferencesMessageSchema,
  UserPreferencesUpdatedDataSchema,
  UserPreferencesUpdatedMessageSchema,
  type SetUserPreferencesData,
  type SetUserPreferencesMessage,
  type UserPreferencesUpdatedData,
  type UserPreferencesUpdatedMessage,

  type AnyMessage,

  // Agent Error types
  AgentErrorMessageSchema,
  type AgentErrorMessage,

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
  createRequestTask,
  createConfirmTask,
  createSetUserPreferences,

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
  PaymentError,

  // Validation helpers
  validateEventData,
  safeValidateEventData
} from "./events";

// Error codes
export { ErrorCode } from "./error-codes";

// Health status types
export { type HealthStatus } from "./health";

// Agent category types
export {
  AGENT_CATEGORIES,
  MAX_CATEGORIES,
  AgentCategorySchema,
  type AgentCategory
} from "./categories";
