/**
 * Core message schemas for Teneo Protocol SDK using Zod
 * Provides runtime validation and TypeScript type inference
 */

import { z } from "zod";
import { AgentCategorySchema, MAX_CATEGORIES } from "./categories";

/**
 * Coerces string booleans to actual booleans with strict validation.
 * The server sometimes sends "true"/"false" as strings instead of actual booleans.
 *
 * Accepts:
 * - Booleans: true, false
 * - Truthy strings (case-insensitive): "true", "1", "yes"
 * - Falsy strings (case-insensitive): "false", "0", "no"
 *
 * Rejects: Any other string value (throws validation error)
 *
 * @throws {ZodError} If string value is not a recognized boolean representation
 */
const stringToBoolean = z
  .union([
    z.boolean(),
    z.string().transform((val, ctx) => {
      const normalized = val.toLowerCase().trim();

      // Accept truthy values
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }

      // Accept falsy values
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }

      // Reject invalid values
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid boolean value: "${val}". Expected: true/false, yes/no, 1/0 (case-insensitive)`
      });
      return z.NEVER;
    })
  ])
  .pipe(z.boolean());

// Enum schemas
export const MessageTypeSchema = z.enum([
  // Authentication
  "request_challenge",
  "challenge",
  "check_cached_auth",
  "auth",
  "auth_required",
  "auth_success",
  "auth_error",
  "register",
  "registration_success",

  // Communication
  "message",
  "task",
  "task_response",
  "agent_selected",

  // Quote-Approve Flow (v2.2.0)
  "request_task",
  "task_quote",
  "confirm_task",

  // System
  "agents",
  "error",
  "ping",
  "pong",
  "capabilities",

  // Room Subscription (Basic)
  "subscribe",
  "unsubscribe",
  "list_rooms",

  // === NEW IN v2.0.0 ===

  // Room Management (6 types)
  "create_room",
  "update_room",
  "delete_room",
  "add_room_member",
  "remove_room_member",
  "list_room_members",

  // Room Management Responses (3 types)
  "room_operation_response",
  "room_member_operation_response",
  "room_members_response",

  // Agent Room Management (5 types)
  "add_agent_to_room",
  "remove_agent_from_room",
  "list_room_agents",
  "list_available_agents",
  "agent_status_update",

  // Agent Room Management Responses (3 types)
  "agent_room_operation_response",
  "room_agents_response",
  "available_agents_response",

  // Room Ping System (2 types)
  "room_ping",
  "room_pong",

  // Admin Messages (7 types)
  "list_all_agents",
  "all_agents_response",
  "user_count",
  "user_authenticated",
  "rate_limit_notification",
  "get_agent_details",
  "agent_details_response"
]);

export const ContentTypeSchema = z.enum([
  "text/plain",
  "text/markdown",
  "text/html",
  "application/json",
  "image/*",
  "STRING",
  "JSON",
  "MD",
  "ARRAY"
]);

export const ClientTypeSchema = z.enum(["user", "agent", "coordinator"]);

export const AgentTypeSchema = z.enum(["command", "nlp", "mcp"]);

export const AgentStatusSchema = z.enum(["online", "offline"]);

// Supporting schemas
export const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string().optional()
});

export const CommandSchema = z.object({
  trigger: z.string(),
  argument: z.string().optional(),
  description: z.string().optional()
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  is_public: stringToBoolean.optional(),
  is_active: stringToBoolean.optional(),
  is_owner: stringToBoolean.optional(),
  created_by: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

// RoomInfo schema for v2.0.0 - used in auth responses and room management
export const RoomInfoSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(), // Optional for permissive parsing
    description: z.string().optional().nullable(),
    is_public: z.boolean().optional(), // Optional - defaults to false on backend
    created_by: z.string().optional(), // Optional in case backend doesn't send it yet
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    is_owner: z.boolean().optional() // Client-side enrichment, may not always be present
  })
  .passthrough(); // Allow extra fields backend might add

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  room: z.string().optional(),
  capabilities: z.array(CapabilitySchema).optional(),
  commands: z.array(CommandSchema).optional(),
  status: AgentStatusSchema,
  image: z.string().optional(),
  agentType: AgentTypeSchema.optional(),
  nlpFallback: stringToBoolean.optional(),
  webhookUrl: z.string().url().optional(),
  categories: z.array(AgentCategorySchema).max(MAX_CATEGORIES).optional()
});

// Base message schema
export const BaseMessageSchema = z
  .object({
    type: MessageTypeSchema,
    content: z.any().optional(),
    content_type: ContentTypeSchema.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    room: z.string().optional(),
    timestamp: z.string().optional(),
    data: z.record(z.any()).optional(),
    signature: z.string().optional(),
    publicKey: z.string().optional(),
    reasoning: z.string().optional(),
    task_id: z.string().optional(),
    id: z.string().optional() // Added for message tracking
  })
  .passthrough(); // Allow message-specific fields to pass through

// Authentication message schemas
export const RequestChallengeMessageSchema = BaseMessageSchema.extend({
  type: z.literal("request_challenge"),
  data: z.object({
    userType: ClientTypeSchema,
    address: z.string().optional()
  })
});

export const ChallengeMessageSchema = BaseMessageSchema.extend({
  type: z.literal("challenge"),
  data: z.object({
    challenge: z.string(),
    timestamp: z.number()
  })
});

export const CheckCachedAuthMessageSchema = BaseMessageSchema.extend({
  type: z.literal("check_cached_auth"),
  data: z.object({
    address: z.string()
  })
});

export const AuthRequiredMessageSchema = BaseMessageSchema.extend({
  type: z.literal("auth_required"),
  content: z.string().optional(),
  from: z.literal("system").optional(),
  data: z
    .object({
      cache_ttl_hours: z.number().optional(),
      supported_auth_methods: z.array(z.string()).optional(),
      supports_cache_check: z.boolean().optional()
    })
    .optional()
});

export const AuthMessageSchema = BaseMessageSchema.extend({
  type: z.literal("auth"),
  data: z
    .object({
      address: z.string().optional(),
      signature: z.string().optional(),
      message: z.string().optional(),
      userType: ClientTypeSchema.optional(),
      agentName: z.string().optional(),
      id: z.string().optional(),
      type: ClientTypeSchema.optional(),
      nft_verified: stringToBoolean.optional(),
      is_whitelisted: stringToBoolean.optional(),
      is_admin_whitelisted: stringToBoolean.optional(),
      rooms: z.array(RoomSchema).optional(),
      private_rooms: z.array(RoomSchema).optional(),
      private_room_id: z.string().optional(),
      cached_auth: stringToBoolean.optional(),
      max_private_rooms: z.number().optional()
    })
    .optional()
});

export const AuthSuccessMessageSchema = BaseMessageSchema.extend({
  type: z.literal("auth_success"),
  data: z.object({
    id: z.string(),
    type: ClientTypeSchema,
    address: z.string(),
    nft_verified: stringToBoolean.optional(),
    is_whitelisted: stringToBoolean.optional(),
    is_admin_whitelisted: stringToBoolean.optional(),
    rooms: z.array(RoomInfoSchema).optional().nullable(), // v2.0.0: Uses RoomInfo with is_owner field
    private_room_id: z.string().optional(), // DEPRECATED: Use rooms array instead
    cached_auth: stringToBoolean.optional(), // Admin field, optional
    max_private_rooms: z.number().optional() // NEW in v2.0.0: Max rooms user can create
  })
});

export const AuthErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal("auth_error"),
  data: z.object({
    error: z.string(),
    code: z.number().optional()
  })
});

// Registration message schemas
export const RegisterMessageSchema = BaseMessageSchema.extend({
  type: z.literal("register"),
  data: z.object({
    name: z.string().optional(),
    userType: ClientTypeSchema,
    room: z.string(),
    capabilities: z.array(CapabilitySchema).optional(),
    commands: z.array(CommandSchema).optional(),
    nft_token_id: z.string().optional(),
    wallet_address: z.string().optional(),
    challenge: z.string().optional(),
    challenge_response: z.string().optional()
  })
});

export const RegistrationSuccessMessageSchema = BaseMessageSchema.extend({
  type: z.literal("registration_success"),
  data: z.object({
    agent_id: z.string(),
    name: z.string(),
    room: z.string()
  })
});

// Communication message schemas
export const UserMessageSchema = BaseMessageSchema.extend({
  type: z.literal("message"),
  content: z.string(),
  room: z.string().optional()
});

export const TaskMessageSchema = BaseMessageSchema.extend({
  type: z.literal("task"),
  content: z.string(),
  from: z.literal("coordinator"),
  to: z.string(),
  room: z.string(),
  data: z.object({
    task_id: z.string(),
    user_prompt: z.string(),
    requesting_user_id: z.string(),
    room_id: z.string()
  })
});

export const TaskResponseMessageSchema = BaseMessageSchema.extend({
  type: z.literal("task_response"),
  content: z.string(),
  content_type: ContentTypeSchema,
  from: z.string(),
  data: z.object({
    task_id: z.string(),
    agent_name: z.string().optional(),
    success: stringToBoolean.optional(),
    error: z.string().optional()
  })
});

export const AgentSelectedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("agent_selected"),
  content: z.string(),
  from: z.literal("coordinator"),
  reasoning: z.string(),
  data: z.object({
    agent_id: z.string(),
    agent_name: z.string(),
    capabilities: z.array(CapabilitySchema).optional(),
    user_request: z.string(),
    command: z.string().optional(),
    command_reasoning: z.string().optional()
  })
});

// ============================================================================
// QUOTE-APPROVE FLOW SCHEMAS (v2.2.0)
// ============================================================================

// Pricing information schema (flexible to handle server variations)
export const PricingInfoSchema = z
  .object({
    pricePerUnit: z.number().optional(),
    price_per_unit: z.number().optional(),
    priceType: z.string().optional(),
    price_type: z.string().optional(),
    timeUnit: z.string().optional(),
    time_unit: z.string().optional(),
    currency: z.string().optional().default("USDC"),
    network: z.string().optional()
  })
  .transform((data) => ({
    // Normalize to camelCase
    pricePerUnit: data.pricePerUnit ?? data.price_per_unit ?? 0,
    priceType: data.priceType ?? data.price_type,
    timeUnit: data.timeUnit ?? data.time_unit,
    currency: data.currency,
    network: data.network
  }));

// Request task message (initiates quote-approve flow)
export const RequestTaskMessageSchema = BaseMessageSchema.extend({
  type: z.literal("request_task"),
  content: z.string(),
  room: z.string()
});

// Task quote message (server response with pricing)
export const TaskQuoteMessageSchema = BaseMessageSchema.extend({
  type: z.literal("task_quote"),
  from: z.literal("coordinator"),
  data: z.object({
    task_id: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
    agent_wallet: z.string(),
    command: z.string(),
    pricing: PricingInfoSchema,
    expires_at: z.string()
  })
});

// Confirm task message (with payment at top level - backend expects msg.payment)
export const ConfirmTaskMessageSchema = BaseMessageSchema.extend({
  type: z.literal("confirm_task"),
  data: z.object({
    task_id: z.string()
  }),
  payment: z.string().optional() // x402 payment at top level (backend checks msg.Payment)
});

// System message schemas
export const AgentsListMessageSchema = BaseMessageSchema.extend({
  type: z.literal("agents"),
  from: z.literal("system"),
  data: z.array(AgentSchema)
});

export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal("error"),
  content: z.string(),
  from: z.literal("system"),
  data: z.object({
    code: z.number(),
    message: z.string(),
    details: z.any().optional()
  })
});

export const PingMessageSchema = BaseMessageSchema.extend({
  type: z.literal("ping")
});

export const PongMessageSchema = BaseMessageSchema.extend({
  type: z.literal("pong")
});

// Room subscription schemas
export const SubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal("subscribe"),
  data: z.object({
    room_id: z.string()
  })
});

export const UnsubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal("unsubscribe"),
  data: z.object({
    room_id: z.string()
  })
});

export const ListRoomsMessageSchema = BaseMessageSchema.extend({
  type: z.literal("list_rooms")
});

export const SubscribeResponseSchema = BaseMessageSchema.extend({
  type: z.literal("subscribe"),
  data: z.object({
    room_id: z.string(),
    success: z.boolean(),
    message: z.string(),
    subscriptions: z.array(z.string()).optional()
  })
});

export const UnsubscribeResponseSchema = BaseMessageSchema.extend({
  type: z.literal("unsubscribe"),
  data: z.object({
    room_id: z.string(),
    success: z.boolean(),
    message: z.string(),
    subscriptions: z.array(z.string()).optional()
  })
});

export const ListRoomsResponseSchema = BaseMessageSchema.extend({
  type: z.literal("list_rooms"),
  data: z.object({
    rooms: z.array(RoomInfoSchema)
  })
});

// ============================================================================
// ROOM MANAGEMENT SCHEMAS (v2.0.0)
// Note: Permissive schemas to handle backend changes gracefully
// ============================================================================

// Room CRUD Operations
export const CreateRoomMessageSchema = z
  .object({
    type: z.literal("create_room"),
    name: z.string(),
    description: z.string().optional(),
    is_public: z.boolean().optional()
  })
  .passthrough(); // Allow extra fields

export const UpdateRoomMessageSchema = z
  .object({
    type: z.literal("update_room"),
    room_id: z.string(),
    name: z.string().optional(),
    description: z.string().optional()
  })
  .passthrough();

export const DeleteRoomMessageSchema = z
  .object({
    type: z.literal("delete_room"),
    room_id: z.string()
  })
  .passthrough();

export const RoomOperationResponseSchema = z
  .object({
    type: z.literal("room_operation_response"),
    data: z
      .object({
        success: z.boolean().optional(), // Optional - consuming code should handle missing as false
        message: z.string().optional(),
        room_id: z.string().optional(),
        room: RoomInfoSchema.optional(),
        max_rooms: z.number().optional(),
        current_count: z.number().optional()
      })
      .passthrough() // Allow extra fields backend might add
  })
  .passthrough();

// Room Member Management
export const RoomMemberInfoSchema = z
  .object({
    user_id: z.string(),
    added_by: z.string().optional(), // May not always be present
    added_at: z.string().optional(),
    role: z.string().optional()
  })
  .passthrough();

export const AddRoomMemberMessageSchema = z
  .object({
    type: z.literal("add_room_member"),
    room_id: z.string(),
    user_id: z.string()
  })
  .passthrough();

export const RemoveRoomMemberMessageSchema = z
  .object({
    type: z.literal("remove_room_member"),
    room_id: z.string(),
    user_id: z.string()
  })
  .passthrough();

export const ListRoomMembersMessageSchema = z
  .object({
    type: z.literal("list_room_members"),
    room_id: z.string()
  })
  .passthrough();

export const RoomMembersResponseSchema = z
  .object({
    type: z.literal("room_members_response"),
    data: z
      .object({
        room_id: z.string(),
        members: z.array(RoomMemberInfoSchema).optional() // Optional - consuming code should handle missing as []
      })
      .passthrough()
  })
  .passthrough();

export const RoomMemberOperationResponseSchema = z
  .object({
    type: z.literal("room_member_operation_response"),
    data: z
      .object({
        success: z.boolean().optional(),
        message: z.string().optional(),
        room_id: z.string().optional(),
        user_id: z.string().optional(),
        member_count: z.number().optional()
      })
      .passthrough()
  })
  .passthrough();

// ============================================================================
// AGENT ROOM MANAGEMENT SCHEMAS (v2.0.0)
// Note: Permissive schemas to handle backend changes gracefully
// ============================================================================

export const AgentRoomInfoSchema = z
  .object({
    agent_id: z.string(),
    agent_name: z.string().optional(),
    description: z.string().optional(),
    capabilities: z.array(CapabilitySchema).optional(),
    commands: z.array(CommandSchema).optional(),
    image: z.string().optional(),
    status: z.string().optional(),
    added_by: z.string().optional(),
    added_at: z.string().optional(),
    categories: z.array(AgentCategorySchema).max(MAX_CATEGORIES).optional()
  })
  .passthrough();

export const AddAgentToRoomMessageSchema = z
  .object({
    type: z.literal("add_agent_to_room"),
    room_id: z.string(),
    agent_id: z.string()
  })
  .passthrough();

export const RemoveAgentFromRoomMessageSchema = z
  .object({
    type: z.literal("remove_agent_from_room"),
    room_id: z.string(),
    agent_id: z.string()
  })
  .passthrough();

export const ListRoomAgentsMessageSchema = z
  .object({
    type: z.literal("list_room_agents"),
    room_id: z.string()
  })
  .passthrough();

export const ListAvailableAgentsMessageSchema = z
  .object({
    type: z.literal("list_available_agents"),
    room_id: z.string()
  })
  .passthrough();

export const RoomAgentsResponseSchema = z
  .object({
    type: z.literal("room_agents_response"),
    data: z
      .object({
        room_id: z.string(),
        agents: z.array(AgentRoomInfoSchema).optional() // Optional - consuming code should handle missing as []
      })
      .passthrough()
  })
  .passthrough();

export const AvailableAgentsResponseSchema = z
  .object({
    type: z.literal("available_agents_response"),
    data: z
      .object({
        agents: z.array(AgentRoomInfoSchema).optional()
      })
      .passthrough()
  })
  .passthrough();

export const AgentRoomOperationResponseSchema = z
  .object({
    type: z.literal("agent_room_operation_response"),
    data: z
      .object({
        success: z.boolean().optional(),
        message: z.string().optional(),
        room_id: z.string().optional(),
        agent_id: z.string().optional(),
        agent_count: z.number().optional()
      })
      .passthrough()
  })
  .passthrough();

export const AgentStatusUpdateMessageSchema = z
  .object({
    type: z.literal("agent_status_update"),
    data: z
      .object({
        room_id: z.string(),
        agent_id: z.string(),
        status: z.string(),
        agent: AgentRoomInfoSchema.optional()
      })
      .passthrough()
  })
  .passthrough();

// Room Ping System
export const RoomPingMessageSchema = z
  .object({
    type: z.literal("room_ping"),
    room_id: z.string()
  })
  .passthrough();

export const RoomPongResponseSchema = z
  .object({
    type: z.literal("room_pong"),
    data: z
      .object({
        room_id: z.string(),
        live_count: z.number().optional(), // Optional - consuming code should handle missing as 0
        timestamp: z.string()
      })
      .passthrough()
  })
  .passthrough();

// Admin agent info (admin only)
export const AdminAgentInfoSchema = z
  .object({
    agent_id: z.string(),
    agent_name: z.string(),
    creator: z.string(),
    creator_name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
    is_online: z.boolean().optional(),
    is_active: z.boolean().optional(),
    is_verified: z.boolean().optional(),
    is_public: z.boolean().optional(),
    is_banned: z.boolean().optional(),
    created_at: z.string().optional().nullable()
  })
  .passthrough();

export type AdminAgentInfo = z.infer<typeof AdminAgentInfoSchema>;

// List all agents request (client → server, admin only)
export const ListAllAgentsMessageSchema = z
  .object({
    type: z.literal("list_all_agents"),
    request_id: z.string().optional(),
    filter: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional()
  })
  .passthrough();

export type ListAllAgentsMessage = z.infer<typeof ListAllAgentsMessageSchema>;

// All agents response (server → client, admin only)
export const AllAgentsResponseSchema = z
  .object({
    type: z.literal("all_agents_response"),
    request_id: z.string().optional(),
    data: z
      .object({
        agents: z.array(AdminAgentInfoSchema),
        total: z.number(),
        offset: z.number(),
        limit: z.number(),
        has_more: z.boolean(),
        filter: z.string().optional()
      })
      .passthrough()
  })
  .passthrough();

export type AllAgentsResponse = z.infer<typeof AllAgentsResponseSchema>;

// User count message (server → client, admin only)
export const UserCountMessageSchema = z
  .object({
    type: z.literal("user_count"),
    data: z
      .object({
        count: z.number(),
        timestamp: z.string()
      })
      .passthrough()
  })
  .passthrough();

export type UserCountMessage = z.infer<typeof UserCountMessageSchema>;

// User authenticated message (server → client)
export const UserAuthenticatedMessageSchema = z
  .object({
    type: z.literal("user_authenticated"),
    data: z
      .object({
        wallet: z.string()
      })
      .passthrough()
  })
  .passthrough();

export type UserAuthenticatedMessage = z.infer<typeof UserAuthenticatedMessageSchema>;

// Rate limit notification (server → client)
export const RateLimitNotificationMessageSchema = z
  .object({
    type: z.literal("rate_limit_notification"),
    data: z
      .object({
        title: z.string(),
        message: z.string(),
        cta_text: z.string().optional(),
        cta_link: z.string().optional(),
        message_type: z.string(),
        limit_type: z.string(),
        reset_at: z.string().optional()
      })
      .passthrough()
  })
  .passthrough();

export type RateLimitNotificationMessage = z.infer<typeof RateLimitNotificationMessageSchema>;

// Agent details request (client → server)
export const GetAgentDetailsMessageSchema = z
  .object({
    type: z.literal("get_agent_details"),
    agent_id: z.string(),
    request_id: z.string().optional()
  })
  .passthrough();

export type GetAgentDetailsMessage = z.infer<typeof GetAgentDetailsMessageSchema>;

// Agent details response (server → client)
export const AgentDetailsResponseMessageSchema = z
  .object({
    type: z.literal("agent_details_response"),
    request_id: z.string().optional(),
    data: AgentRoomInfoSchema.optional(),
    error: z.string().optional()
  })
  .passthrough();

export type AgentDetailsResponseMessage = z.infer<typeof AgentDetailsResponseMessageSchema>;

// Union of all INCOMING message schemas for validation
// Note: Outgoing message schemas (Subscribe, Unsubscribe, ListRooms) are excluded
// as they share the same type values with their response counterparts
export const AnyMessageSchema = z.discriminatedUnion("type", [
  // Authentication & Registration
  RequestChallengeMessageSchema,
  ChallengeMessageSchema,
  CheckCachedAuthMessageSchema,
  AuthRequiredMessageSchema,
  AuthMessageSchema,
  AuthSuccessMessageSchema,
  AuthErrorMessageSchema,
  RegisterMessageSchema,
  RegistrationSuccessMessageSchema,

  // Communication
  UserMessageSchema,
  TaskMessageSchema,
  TaskResponseMessageSchema,
  AgentSelectedMessageSchema,
  AgentsListMessageSchema,

  // Quote-Approve Flow (v2.2.0)
  TaskQuoteMessageSchema,

  // System
  ErrorMessageSchema,
  PingMessageSchema,
  PongMessageSchema,

  // Room Subscription (Basic)
  SubscribeResponseSchema,
  UnsubscribeResponseSchema,
  ListRoomsResponseSchema,

  // Room Management Responses (v2.0.0)
  RoomOperationResponseSchema,
  RoomMemberOperationResponseSchema,
  RoomMembersResponseSchema,

  // Agent Room Management Responses (v2.0.0)
  AgentRoomOperationResponseSchema,
  RoomAgentsResponseSchema,
  AvailableAgentsResponseSchema,
  AgentStatusUpdateMessageSchema,

  // Room Ping System (v2.0.0)
  RoomPongResponseSchema,

  // Admin Messages
  AllAgentsResponseSchema,
  UserCountMessageSchema,
  UserAuthenticatedMessageSchema,
  RateLimitNotificationMessageSchema,
  AgentDetailsResponseMessageSchema
]);

// Type inference from schemas
export type MessageType = z.infer<typeof MessageTypeSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export type ClientType = z.infer<typeof ClientTypeSchema>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export type Capability = z.infer<typeof CapabilitySchema>;
export type Command = z.infer<typeof CommandSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Agent = z.infer<typeof AgentSchema>;

export type BaseMessage = z.infer<typeof BaseMessageSchema>;
export type RequestChallengeMessage = z.infer<typeof RequestChallengeMessageSchema>;
export type ChallengeMessage = z.infer<typeof ChallengeMessageSchema>;
export type CheckCachedAuthMessage = z.infer<typeof CheckCachedAuthMessageSchema>;
export type AuthRequiredMessage = z.infer<typeof AuthRequiredMessageSchema>;
export type AuthMessage = z.infer<typeof AuthMessageSchema>;
export type AuthSuccessMessage = z.infer<typeof AuthSuccessMessageSchema>;
export type AuthErrorMessage = z.infer<typeof AuthErrorMessageSchema>;
export type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
export type RegistrationSuccessMessage = z.infer<typeof RegistrationSuccessMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type TaskMessage = z.infer<typeof TaskMessageSchema>;
export type TaskResponseMessage = z.infer<typeof TaskResponseMessageSchema>;
export type AgentSelectedMessage = z.infer<typeof AgentSelectedMessageSchema>;
export type AgentsListMessage = z.infer<typeof AgentsListMessageSchema>;

// Quote-Approve Flow Types (v2.2.0)
export type PricingInfo = z.infer<typeof PricingInfoSchema>;
export type RequestTaskMessage = z.infer<typeof RequestTaskMessageSchema>;
export type TaskQuoteMessage = z.infer<typeof TaskQuoteMessageSchema>;
export type ConfirmTaskMessage = z.infer<typeof ConfirmTaskMessageSchema>;

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type SubscribeMessage = z.infer<typeof SubscribeMessageSchema>;
export type UnsubscribeMessage = z.infer<typeof UnsubscribeMessageSchema>;
export type ListRoomsMessage = z.infer<typeof ListRoomsMessageSchema>;
export type SubscribeResponse = z.infer<typeof SubscribeResponseSchema>;
export type UnsubscribeResponse = z.infer<typeof UnsubscribeResponseSchema>;
export type RoomInfo = z.infer<typeof RoomInfoSchema>;
export type ListRoomsResponse = z.infer<typeof ListRoomsResponseSchema>;

// Room Management Types (v2.0.0)
export type CreateRoomMessage = z.infer<typeof CreateRoomMessageSchema>;
export type UpdateRoomMessage = z.infer<typeof UpdateRoomMessageSchema>;
export type DeleteRoomMessage = z.infer<typeof DeleteRoomMessageSchema>;
export type RoomOperationResponse = z.infer<typeof RoomOperationResponseSchema>;
export type RoomMemberInfo = z.infer<typeof RoomMemberInfoSchema>;
export type AddRoomMemberMessage = z.infer<typeof AddRoomMemberMessageSchema>;
export type RemoveRoomMemberMessage = z.infer<typeof RemoveRoomMemberMessageSchema>;
export type ListRoomMembersMessage = z.infer<typeof ListRoomMembersMessageSchema>;
export type RoomMembersResponse = z.infer<typeof RoomMembersResponseSchema>;
export type RoomMemberOperationResponse = z.infer<typeof RoomMemberOperationResponseSchema>;

// Agent Room Management Types (v2.0.0)
export type AgentRoomInfo = z.infer<typeof AgentRoomInfoSchema>;
export type AddAgentToRoomMessage = z.infer<typeof AddAgentToRoomMessageSchema>;
export type RemoveAgentFromRoomMessage = z.infer<typeof RemoveAgentFromRoomMessageSchema>;
export type ListRoomAgentsMessage = z.infer<typeof ListRoomAgentsMessageSchema>;
export type ListAvailableAgentsMessage = z.infer<typeof ListAvailableAgentsMessageSchema>;
export type RoomAgentsResponse = z.infer<typeof RoomAgentsResponseSchema>;
export type AvailableAgentsResponse = z.infer<typeof AvailableAgentsResponseSchema>;
export type AgentRoomOperationResponse = z.infer<typeof AgentRoomOperationResponseSchema>;
export type AgentStatusUpdateMessage = z.infer<typeof AgentStatusUpdateMessageSchema>;

// Room Ping Types (v2.0.0)
export type RoomPingMessage = z.infer<typeof RoomPingMessageSchema>;
export type RoomPongResponse = z.infer<typeof RoomPongResponseSchema>;

export type AnyMessage = z.infer<typeof AnyMessageSchema>;

// Type guards using Zod parse
export function isAuthSuccess(msg: unknown): msg is AuthSuccessMessage {
  return AuthSuccessMessageSchema.safeParse(msg).success;
}

export function isAuthError(msg: unknown): msg is AuthErrorMessage {
  return AuthErrorMessageSchema.safeParse(msg).success;
}

export function isAuth(msg: unknown): msg is AuthMessage {
  return AuthMessageSchema.safeParse(msg).success;
}

export function isChallenge(msg: unknown): msg is ChallengeMessage {
  return ChallengeMessageSchema.safeParse(msg).success;
}

export function isAgentSelected(msg: unknown): msg is AgentSelectedMessage {
  return AgentSelectedMessageSchema.safeParse(msg).success;
}

export function isTaskResponse(msg: unknown): msg is TaskResponseMessage {
  return TaskResponseMessageSchema.safeParse(msg).success;
}

export function isError(msg: unknown): msg is ErrorMessage {
  return ErrorMessageSchema.safeParse(msg).success;
}

export function isAgentsList(msg: unknown): msg is AgentsListMessage {
  return AgentsListMessageSchema.safeParse(msg).success;
}

// Message factory functions with validation
export function createRequestChallenge(
  userType: ClientType = "user",
  address?: string
): RequestChallengeMessage {
  return RequestChallengeMessageSchema.parse({
    type: "request_challenge",
    data: {
      userType,
      ...(address && { address })
    }
  });
}

export function createCheckCachedAuth(address: string): CheckCachedAuthMessage {
  return CheckCachedAuthMessageSchema.parse({
    type: "check_cached_auth",
    data: { address }
  });
}

export function createAuth(
  address: string,
  signature: string,
  message: string,
  userType: ClientType = "user"
): AuthMessage {
  return AuthMessageSchema.parse({
    type: "auth",
    data: {
      address,
      signature,
      message,
      userType
    }
  });
}

export function createUserMessage(content: string, room: string, from?: string): UserMessage {
  return UserMessageSchema.parse({
    type: "message",
    content,
    room,
    ...(from && { from })
  });
}

export function createPing(): PingMessage {
  return PingMessageSchema.parse({
    type: "ping"
  });
}

export function createSubscribe(roomId: string): SubscribeMessage {
  return SubscribeMessageSchema.parse({
    type: "subscribe",
    data: { room_id: roomId }
  });
}

export function createUnsubscribe(roomId: string): UnsubscribeMessage {
  return UnsubscribeMessageSchema.parse({
    type: "unsubscribe",
    data: { room_id: roomId }
  });
}

export function createListRooms(): ListRoomsMessage {
  return ListRoomsMessageSchema.parse({
    type: "list_rooms"
  });
}

// Quote-Approve Flow factory functions (v2.2.0)
export function createRequestTask(content: string, room: string): RequestTaskMessage {
  return RequestTaskMessageSchema.parse({
    type: "request_task",
    content,
    room
  });
}

export function createConfirmTask(taskId: string, x402Payment?: string): ConfirmTaskMessage {
  return ConfirmTaskMessageSchema.parse({
    type: "confirm_task",
    data: {
      task_id: taskId
    },
    ...(x402Payment && { payment: x402Payment }) // payment at top level for backend
  });
}

// Validation helper
export function validateMessage(message: unknown): AnyMessage {
  return AnyMessageSchema.parse(message);
}

// Safe parse helper
export function safeParseMessage(message: unknown): {
  success: boolean;
  data?: AnyMessage | BaseMessage;
  error?: z.ZodError;
} {
  // Try specific message schemas first
  const result = AnyMessageSchema.safeParse(message);
  if (result.success) {
    return { success: true, data: result.data };
  }

  // Fall back to basic BaseMessage schema for unknown message types
  // This allows the SDK to be more resilient to backend changes
  const fallbackResult = BaseMessageSchema.safeParse(message);
  if (fallbackResult.success) {
    return { success: true, data: fallbackResult.data as BaseMessage };
  }

  return { success: false, error: result.error };
}
