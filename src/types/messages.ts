/**
 * Core message schemas for Teneo Protocol SDK using Zod
 * Provides runtime validation and TypeScript type inference
 */

import { z } from "zod";

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
  "request_challenge",
  "challenge",
  "check_cached_auth",
  "auth",
  "auth_required",
  "auth_success",
  "auth_error",
  "register",
  "registration_success",
  "message",
  "task",
  "task_response",
  "agent_selected",
  "agents",
  "error",
  "ping",
  "pong",
  "capabilities",
  "subscribe",
  "unsubscribe",
  "list_rooms"
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
  description: z.string()
});

export const CommandSchema = z.object({
  trigger: z.string(),
  argument: z.string().optional(),
  description: z.string()
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  is_public: stringToBoolean,
  is_active: stringToBoolean,
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

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
  webhookUrl: z.string().url().optional()
});

// Base message schema
export const BaseMessageSchema = z.object({
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
});

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
      private_room_id: z.string().optional(),
      cached_auth: stringToBoolean.optional()
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
    rooms: z.array(RoomSchema).optional(),
    private_room_id: z.string().optional(),
    cached_auth: stringToBoolean.optional()
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

export const RoomInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  is_public: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  is_owner: z.boolean()
});

export const ListRoomsResponseSchema = BaseMessageSchema.extend({
  type: z.literal("list_rooms"),
  data: z.object({
    rooms: z.array(RoomInfoSchema)
  })
});

// Union of all INCOMING message schemas for validation
// Note: Outgoing message schemas (Subscribe, Unsubscribe, ListRooms) are excluded
// as they share the same type values with their response counterparts
export const AnyMessageSchema = z.discriminatedUnion("type", [
  RequestChallengeMessageSchema,
  ChallengeMessageSchema,
  CheckCachedAuthMessageSchema,
  AuthRequiredMessageSchema,
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
  // Only response schemas for room operations (not outgoing request schemas)
  SubscribeResponseSchema,
  UnsubscribeResponseSchema,
  ListRoomsResponseSchema
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

// Validation helper
export function validateMessage(message: unknown): AnyMessage {
  return AnyMessageSchema.parse(message);
}

// Safe parse helper
export function safeParseMessage(message: unknown): {
  success: boolean;
  data?: AnyMessage;
  error?: z.ZodError;
} {
  const result = AnyMessageSchema.safeParse(message);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
