/**
 * Validation schemas for user inputs
 * Provides strict validation with length limits, character restrictions, and format requirements
 */

import { z } from "zod";

/**
 * Validates room IDs with strict constraints.
 * - Must not be empty
 * - Maximum 100 characters
 * - Only alphanumeric characters, spaces, dashes, and underscores allowed
 * - Automatically trims whitespace
 *
 * @example
 * ```typescript
 * const roomId = RoomIdSchema.parse('general-chat'); // OK
 * const roomId = RoomIdSchema.parse('room_123'); // OK
 * const roomId = RoomIdSchema.parse('Crawler Room'); // OK
 * const roomId = RoomIdSchema.parse('invalid room!'); // Error: invalid characters
 * ```
 */
export const RoomIdSchema = z
  .string()
  .min(1, "Room ID cannot be empty")
  .max(100, "Room ID must be 100 characters or less")
  .regex(
    /^[a-zA-Z0-9_ -]+$/,
    "Room ID can only contain letters, numbers, spaces, dashes, and underscores"
  )
  .trim();

/**
 * Validates agent IDs with strict constraints.
 * - Must not be empty
 * - Maximum 100 characters
 * - Only alphanumeric characters, dashes, and underscores allowed
 * - Automatically trims whitespace
 *
 * @example
 * ```typescript
 * const agentId = AgentIdSchema.parse('agent-123'); // OK
 * const agentId = AgentIdSchema.parse('my_agent'); // OK
 * const agentId = AgentIdSchema.parse('invalid agent!'); // Error: invalid characters
 * ```
 */
export const AgentIdSchema = z
  .string()
  .min(1, "Agent ID cannot be empty")
  .max(100, "Agent ID must be 100 characters or less")
  .regex(/^[a-zA-Z0-9_-]+$/, "Agent ID can only contain letters, numbers, dashes, and underscores")
  .trim();

/**
 * Validates message content with strict constraints.
 * - Must not be empty
 * - Maximum 10,000 characters to prevent abuse
 * - No control characters (except newline, tab, carriage return)
 * - Automatically trims whitespace
 *
 * @example
 * ```typescript
 * const content = MessageContentSchema.parse('Hello, world!'); // OK
 * const content = MessageContentSchema.parse('Multi\nline\nmessage'); // OK
 * const content = MessageContentSchema.parse('\x00Bad content'); // Error: control characters
 * ```
 */
export const MessageContentSchema = z
  .string()
  .trim()
  .min(1, "Message content cannot be empty")
  .max(10000, "Message content must be 10,000 characters or less")
  .refine(
    // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters to prevent injection
    (str) => !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str),
    "Message content cannot contain control characters"
  );

/**
 * Validates agent command content (string) with strict constraints.
 * - Must not be empty
 * - Maximum 5,000 characters
 * - No control characters (except newline, tab, carriage return)
 * - Automatically trims whitespace
 *
 * @example
 * ```typescript
 * const command = AgentCommandContentSchema.parse('execute task'); // OK
 * const command = AgentCommandContentSchema.parse('multi\nline\ncommand'); // OK
 * const command = AgentCommandContentSchema.parse('\x00Bad'); // Error: control characters
 * ```
 */
export const AgentCommandContentSchema = z
  .string()
  .trim()
  .min(1, "Agent command cannot be empty")
  .max(5000, "Agent command must be 5,000 characters or less")
  .refine(
    // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters to prevent injection
    (str) => !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str),
    "Agent command cannot contain control characters"
  );

/**
 * Validates search queries with strict constraints.
 * - Must not be empty
 * - Maximum 200 characters (reasonable for search)
 * - No control characters
 * - Automatically trims whitespace
 *
 * @example
 * ```typescript
 * const query = SearchQuerySchema.parse('find agents'); // OK
 * const query = SearchQuerySchema.parse('\x00Bad query'); // Error: control characters
 * ```
 */
export const SearchQuerySchema = z
  .string()
  .trim()
  .min(1, "Search query cannot be empty")
  .max(200, "Search query must be 200 characters or less")
  .refine(
    // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters to prevent injection
    (str) => !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str),
    "Search query cannot contain control characters"
  );
