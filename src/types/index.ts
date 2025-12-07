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

  // X402 Payment schemas
  PricingInfoSchema,
  TaskQuoteDataSchema,
  RequestTaskMessageSchema,
  TaskQuoteMessageSchema,
  ConfirmTaskDataSchema,
  ConfirmTaskMessageSchema,
  TaskConfirmedMessageSchema,

  // Agent Details schemas
  GetAgentDetailsMessageSchema,
  AgentDetailsResponseSchema,

  // Rate Limit schemas
  RateLimitNotificationDataSchema,
  RateLimitNotificationMessageSchema,

  // Admin schemas
  AdminAgentInfoSchema,
  ListAllAgentsMessageSchema,
  AllAgentsResponseSchema,
  UserCountDataSchema,
  UserCountMessageSchema,

  // User Presence schemas
  UserAuthenticatedDataSchema,
  UserAuthenticatedMessageSchema,

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

  // X402 Payment types
  type PricingInfo,
  type TaskQuoteData,
  type RequestTaskMessage,
  type TaskQuoteMessage,
  type ConfirmTaskData,
  type ConfirmTaskMessage,
  type TaskConfirmedMessage,

  // Agent Details types
  type GetAgentDetailsMessage,
  type AgentDetailsResponse,

  // Rate Limit types
  type RateLimitNotificationData,
  type RateLimitNotificationMessage,

  // Admin types
  type AdminAgentInfo,
  type ListAllAgentsMessage,
  type AllAgentsResponse,
  type UserCountData,
  type UserCountMessage,

  // User Presence types
  type UserAuthenticatedData,
  type UserAuthenticatedMessage,

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
