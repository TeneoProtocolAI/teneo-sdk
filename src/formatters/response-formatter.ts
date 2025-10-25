/**
 * Response formatter for Teneo Protocol SDK using Zod schemas
 * Provides humanized and raw formatting for agent responses with validation
 */

import { z } from "zod";
import {
  BaseMessage,
  TaskResponseMessage,
  AgentSelectedMessage,
  ErrorMessage,
  Agent,
  ContentTypeSchema,
  TaskResponseMessageSchema,
  AgentSelectedMessageSchema,
  ErrorMessageSchema,
  AgentSchema
} from "../types";

// Format option schema
export const FormatOptionSchema = z.enum(["raw", "humanized", "both"]);
export type FormatOption = z.infer<typeof FormatOptionSchema>;

// Response format options schema
export const ResponseFormatOptionsSchema = z.object({
  format: FormatOptionSchema.optional(),
  includeMetadata: z.boolean().optional(),
  includeTimestamps: z.boolean().optional(),
  prettyPrint: z.boolean().optional()
});

export type ResponseFormatOptions = z.infer<typeof ResponseFormatOptionsSchema>;

// Response metadata schema
export const ResponseMetadataSchema = z.object({
  timestamp: z.date(),
  messageType: z.string(),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  taskId: z.string().optional(),
  success: z.boolean().optional(),
  contentType: ContentTypeSchema.optional(),
  reasoning: z.string().optional()
});

// Formatted response schema
export const FormattedResponseSchema = z.object({
  raw: z.any().optional(),
  humanized: z.string().optional(),
  metadata: ResponseMetadataSchema.optional()
});

// Type inference
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;
export type FormattedResponse = z.infer<typeof FormattedResponseSchema>;

export class ResponseFormatter {
  private formatOption: FormatOption;
  private includeMetadata: boolean;
  private includeTimestamps: boolean;
  private prettyPrint: boolean;

  constructor(options: ResponseFormatOptions = {}) {
    const validatedOptions = ResponseFormatOptionsSchema.parse(options);

    this.formatOption = validatedOptions.format ?? "humanized";
    this.includeMetadata = validatedOptions.includeMetadata ?? false;
    this.includeTimestamps = validatedOptions.includeTimestamps ?? true;
    this.prettyPrint = validatedOptions.prettyPrint ?? true;
  }

  /**
   * Formats a message based on current configuration settings.
   * Automatically determines the message type and applies appropriate formatting.
   * Supports raw JSON, humanized text, or both formats simultaneously.
   *
   * @param message - The message to format
   * @returns Formatted response with raw/humanized content and optional metadata
   * @throws {ZodError} If message validation fails
   *
   * @example
   * ```typescript
   * const formatter = new ResponseFormatter({ format: 'both', includeMetadata: true });
   * const formatted = formatter.format(message);
   * console.log(formatted.humanized); // Human-readable text
   * console.log(formatted.raw);       // Original JSON
   * console.log(formatted.metadata);  // Timestamp, agent info, etc.
   * ```
   */
  public format(message: BaseMessage): FormattedResponse {
    const response: FormattedResponse = {};

    // Add metadata if requested
    if (this.includeMetadata) {
      response.metadata = this.extractMetadata(message);
    }

    // Format based on option
    if (this.formatOption === "raw" || this.formatOption === "both") {
      response.raw = this.formatRaw(message);
    }

    if (this.formatOption === "humanized" || this.formatOption === "both") {
      response.humanized = this.formatHumanized(message);
    }

    // Validate the response
    return FormattedResponseSchema.parse(response);
  }

  /**
   * Formats a task response message from an agent.
   * Handles different content types (JSON, Markdown, plain text, arrays)
   * and formats them appropriately for human consumption.
   * Includes agent name, success status, reasoning, and formatted content.
   *
   * @param message - The task response message to format
   * @returns Formatted response with task-specific formatting
   * @throws {ZodError} If message validation fails
   *
   * @example
   * ```typescript
   * const formatted = formatter.formatTaskResponse(taskMessage);
   * // Example output:
   * // [RESPONSE] From Weather Agent:
   * // Temperature: 72°F
   * // Conditions: Sunny
   * // [REASONING] Used latest weather API data
   * ```
   */
  public formatTaskResponse(message: TaskResponseMessage): FormattedResponse {
    // Validate input
    const validatedMessage = TaskResponseMessageSchema.parse(message);
    const response: FormattedResponse = {};

    if (this.includeMetadata) {
      response.metadata = ResponseMetadataSchema.parse({
        timestamp: new Date(validatedMessage.timestamp ?? Date.now()),
        messageType: "task_response",
        agentId: validatedMessage.from,
        agentName: validatedMessage.data?.agent_name,
        taskId: validatedMessage.data?.task_id,
        success: validatedMessage.data?.success !== false,
        contentType: validatedMessage.content_type,
        reasoning: validatedMessage.reasoning
      });
    }

    if (this.formatOption === "raw" || this.formatOption === "both") {
      response.raw = validatedMessage;
    }

    if (this.formatOption === "humanized" || this.formatOption === "both") {
      response.humanized = this.formatTaskResponseHumanized(validatedMessage);
    }

    return FormattedResponseSchema.parse(response);
  }

  /**
   * Formats an agent selection message from the coordinator.
   * Shows which agent was selected, the command being executed,
   * the reasoning behind the selection, and agent capabilities.
   *
   * @param message - The agent selection message to format
   * @returns Formatted response with agent selection details
   * @throws {ZodError} If message validation fails
   *
   * @example
   * ```typescript
   * const formatted = formatter.formatAgentSelected(selectionMessage);
   * // Example output:
   * // [AGENT] Coordinator selected Weather Agent
   * // [COMMAND] Get forecast for New York
   * // [REASONING] Agent has weather-forecast capability
   * // [CAPABILITIES]
   * //   - weather-forecast: Provides weather forecasts
   * ```
   */
  public formatAgentSelected(message: AgentSelectedMessage): FormattedResponse {
    // Validate input
    const validatedMessage = AgentSelectedMessageSchema.parse(message);
    const response: FormattedResponse = {};

    if (this.includeMetadata) {
      response.metadata = ResponseMetadataSchema.parse({
        timestamp: new Date(validatedMessage.timestamp ?? Date.now()),
        messageType: "agent_selected",
        agentId: validatedMessage.data?.agent_id,
        agentName: validatedMessage.data?.agent_name,
        reasoning: validatedMessage.reasoning
      });
    }

    if (this.formatOption === "raw" || this.formatOption === "both") {
      response.raw = validatedMessage;
    }

    if (this.formatOption === "humanized" || this.formatOption === "both") {
      response.humanized = this.formatAgentSelectedHumanized(validatedMessage);
    }

    return FormattedResponseSchema.parse(response);
  }

  /**
   * Formats an error message with error code and details.
   * Displays error message, optional error code, and detailed information
   * in a human-readable format.
   *
   * @param message - The error message to format
   * @returns Formatted response with error information
   * @throws {ZodError} If message validation fails
   *
   * @example
   * ```typescript
   * const formatted = formatter.formatError(errorMessage);
   * // Example output:
   * // [ERROR] Agent not found (Code: AGENT_NOT_FOUND)
   * // Details: {
   * //   "requestedAgent": "unknown-agent",
   * //   "availableAgents": 5
   * // }
   * ```
   */
  public formatError(message: ErrorMessage): FormattedResponse {
    // Validate input
    const validatedMessage = ErrorMessageSchema.parse(message);
    const response: FormattedResponse = {};

    if (this.includeMetadata) {
      response.metadata = ResponseMetadataSchema.parse({
        timestamp: new Date(validatedMessage.timestamp ?? Date.now()),
        messageType: "error",
        success: false
      });
    }

    if (this.formatOption === "raw" || this.formatOption === "both") {
      response.raw = validatedMessage;
    }

    if (this.formatOption === "humanized" || this.formatOption === "both") {
      response.humanized = this.formatErrorHumanized(validatedMessage);
    }

    return FormattedResponseSchema.parse(response);
  }

  /**
   * Formats a list of agents with their details, capabilities, and commands.
   * Displays each agent's name, status, description, room, capabilities, and available commands.
   *
   * @param agents - Array of agents to format
   * @returns Formatted response with agent list
   * @throws {ZodError} If agent validation fails
   *
   * @example
   * ```typescript
   * const formatted = formatter.formatAgentList(agents);
   * // Example output:
   * // [AGENTS] Available Agents (3):
   * //
   * // [AGENT] Weather Agent [ONLINE]
   * //    Provides weather forecasts and conditions
   * //    Room: general
   * //    Capabilities:
   * //       - weather-forecast
   * //    Commands:
   * //       - /weather <location>
   * ```
   */
  public formatAgentList(agents: Agent[]): FormattedResponse {
    // Validate input
    const validatedAgents = z.array(AgentSchema).parse(agents);
    const response: FormattedResponse = {};

    if (this.includeMetadata) {
      response.metadata = ResponseMetadataSchema.parse({
        timestamp: new Date(),
        messageType: "agents_list"
      });
    }

    if (this.formatOption === "raw" || this.formatOption === "both") {
      response.raw = validatedAgents;
    }

    if (this.formatOption === "humanized" || this.formatOption === "both") {
      response.humanized = this.formatAgentListHumanized(validatedAgents);
    }

    return FormattedResponseSchema.parse(response);
  }

  /**
   * Format raw message (no transformation)
   */
  private formatRaw(message: BaseMessage): any {
    return message;
  }

  /**
   * Format message as humanized text
   */
  private formatHumanized(message: BaseMessage): string {
    switch (message.type) {
      case "task_response":
        return this.formatTaskResponseHumanized(message as TaskResponseMessage);

      case "agent_selected":
        return this.formatAgentSelectedHumanized(message as AgentSelectedMessage);

      case "error":
        return this.formatErrorHumanized(message as ErrorMessage);

      case "message":
        return this.formatMessageHumanized(message);

      default:
        return message.content || JSON.stringify(message.data || {});
    }
  }

  /**
   * Format task response as humanized text
   */
  private formatTaskResponseHumanized(message: TaskResponseMessage): string {
    const agentName = message.data?.agent_name || message.from || "Agent";
    const success = message.data?.success !== false;

    let result = `[RESPONSE] From ${agentName}:\n`;

    if (!success && message.data?.error) {
      result += `[ERROR] ${message.data.error}\n`;
    }

    // Format content based on content type
    if (message.content_type === "application/json" || message.content_type === "JSON") {
      try {
        const json =
          typeof message.content === "string" ? JSON.parse(message.content) : message.content;
        result += this.formatJSON(json);
      } catch {
        result += message.content;
      }
    } else if (message.content_type === "text/markdown" || message.content_type === "MD") {
      result += message.content;
    } else if (message.content_type === "ARRAY") {
      try {
        const array =
          typeof message.content === "string" ? JSON.parse(message.content) : message.content;
        result += this.formatArray(array);
      } catch {
        result += message.content;
      }
    } else {
      result += message.content;
    }

    if (message.reasoning) {
      result += `\n[REASONING] ${message.reasoning}`;
    }

    return result;
  }

  /**
   * Format agent selection as humanized text
   */
  private formatAgentSelectedHumanized(message: AgentSelectedMessage): string {
    let result = `[AGENT] Coordinator selected ${message.data?.agent_name}`;

    if (message.data?.command) {
      result += `\n[COMMAND] ${message.data.command}`;
    }

    if (message.reasoning) {
      result += `\n[REASONING] ${message.reasoning}`;
    }

    if (message.data?.capabilities && message.data.capabilities.length > 0) {
      result += "\n[CAPABILITIES]";
      for (const cap of message.data.capabilities) {
        result += `\n  - ${cap.name}: ${cap.description}`;
      }
    }

    return result;
  }

  /**
   * Format error as humanized text
   */
  private formatErrorHumanized(message: ErrorMessage): string {
    let result = `[ERROR] ${message.content || message.data?.message || "Unknown error"}`;

    if (message.data?.code) {
      result += ` (Code: ${message.data.code})`;
    }

    if (message.data?.details) {
      result += `\nDetails: ${JSON.stringify(message.data.details, null, 2)}`;
    }

    return result;
  }

  /**
   * Format regular message as humanized text
   */
  private formatMessageHumanized(message: BaseMessage): string {
    const from = message.from || "Unknown";
    let result = `[MESSAGE] ${from}: ${message.content}`;

    if (message.room) {
      result = `[${message.room}] ${result}`;
    }

    return result;
  }

  /**
   * Format agent list as humanized text
   */
  private formatAgentListHumanized(agents: Agent[]): string {
    if (agents.length === 0) {
      return "[AGENTS] No agents available";
    }

    let result = `[AGENTS] Available Agents (${agents.length}):\n`;

    for (const agent of agents) {
      result += `\n[AGENT] ${agent.name}`;

      if (agent.status) {
        const statusText = agent.status === "online" ? "ONLINE" : "OFFLINE";
        result += ` [${statusText}]`;
      }

      if (agent.description) {
        result += `\n   ${agent.description}`;
      }

      if (agent.room) {
        result += `\n   Room: ${agent.room}`;
      }

      if (agent.capabilities && agent.capabilities.length > 0) {
        result += "\n   Capabilities:";
        for (const cap of agent.capabilities) {
          result += `\n      - ${cap.name}`;
        }
      }

      if (agent.commands && agent.commands.length > 0) {
        result += "\n   Commands:";
        for (const cmd of agent.commands) {
          result += `\n      - ${cmd.trigger}${cmd.argument ? ` ${cmd.argument}` : ""}`;
        }
      }
    }

    return result;
  }

  /**
   * Format JSON object for display
   */
  private formatJSON(obj: any, indent = 0): string {
    if (obj === null || obj === undefined) {
      return "null";
    }

    if (typeof obj !== "object") {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      return this.formatArray(obj, indent);
    }

    const spaces = "  ".repeat(indent);
    let result = "";

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result += `${spaces}${key}:\n${this.formatJSON(value, indent + 1)}`;
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    }

    return result;
  }

  /**
   * Format array for display
   */
  private formatArray(arr: any[], indent = 0): string {
    if (arr.length === 0) {
      return "[]";
    }

    const spaces = "  ".repeat(indent);
    let result = "";

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (typeof item === "object" && item !== null) {
        result += `${spaces}[${i}]:\n${this.formatJSON(item, indent + 1)}`;
      } else {
        result += `${spaces}[${i}]: ${item}\n`;
      }
    }

    return result;
  }

  /**
   * Extract metadata from message with validation
   */
  private extractMetadata(message: BaseMessage): ResponseMetadata {
    return ResponseMetadataSchema.parse({
      timestamp: new Date(message.timestamp ?? Date.now()),
      messageType: message.type,
      agentId: message.from,
      agentName: message.data?.agent_name,
      taskId: message.task_id ?? message.data?.task_id,
      success: message.data?.success !== false,
      contentType: message.content_type,
      reasoning: message.reasoning
    });
  }

  /**
   * Updates the format option for future formatting operations.
   * Validates the option with Zod schema before applying.
   *
   * @param option - Format option: 'raw', 'humanized', or 'both'
   * @throws {ZodError} If option is invalid
   *
   * @example
   * ```typescript
   * formatter.setFormatOption('both');
   * // Now all formatted responses include both raw and humanized formats
   * ```
   */
  public setFormatOption(option: FormatOption): void {
    this.formatOption = FormatOptionSchema.parse(option);
  }

  /**
   * Updates whether metadata should be included in formatted responses.
   * Metadata includes timestamp, message type, agent info, task ID, success status, etc.
   *
   * @param include - Whether to include metadata in responses
   * @throws {ZodError} If value is not a boolean
   *
   * @example
   * ```typescript
   * formatter.setIncludeMetadata(true);
   * const formatted = formatter.format(message);
   * console.log(formatted.metadata); // { timestamp, messageType, agentId, ... }
   * ```
   */
  public setIncludeMetadata(include: boolean): void {
    this.includeMetadata = z.boolean().parse(include);
  }

  /**
   * Updates multiple format options at once with validation.
   * Allows configuring format type, metadata inclusion, timestamps, and pretty-printing.
   *
   * @param options - Response format configuration options
   * @param options.format - Format type: 'raw', 'humanized', or 'both'
   * @param options.includeMetadata - Whether to include metadata
   * @param options.includeTimestamps - Whether to include timestamps
   * @param options.prettyPrint - Whether to pretty-print JSON
   * @throws {ZodError} If options fail validation
   *
   * @example
   * ```typescript
   * formatter.setFormatOptions({
   *   format: 'both',
   *   includeMetadata: true,
   *   prettyPrint: true
   * });
   * ```
   */
  public setFormatOptions(options: ResponseFormatOptions): void {
    const validatedOptions = ResponseFormatOptionsSchema.parse(options);

    if (validatedOptions.format !== undefined) {
      this.formatOption = validatedOptions.format;
    }
    if (validatedOptions.includeMetadata !== undefined) {
      this.includeMetadata = validatedOptions.includeMetadata;
    }
    if (validatedOptions.includeTimestamps !== undefined) {
      this.includeTimestamps = validatedOptions.includeTimestamps;
    }
    if (validatedOptions.prettyPrint !== undefined) {
      this.prettyPrint = validatedOptions.prettyPrint;
    }
  }

  /**
   * Gets the current format configuration settings.
   * Returns all current options including format type, metadata, timestamps, and pretty-print.
   *
   * @returns Current format options
   *
   * @example
   * ```typescript
   * const options = formatter.getFormatOptions();
   * console.log(options.format);          // 'both'
   * console.log(options.includeMetadata); // true
   * ```
   */
  public getFormatOptions(): ResponseFormatOptions {
    return {
      format: this.formatOption,
      includeMetadata: this.includeMetadata,
      includeTimestamps: this.includeTimestamps,
      prettyPrint: this.prettyPrint
    };
  }

  /**
   * Static utility method that validates and formats any message in one step.
   * Automatically detects message type and applies appropriate formatting.
   * Useful for formatting messages without creating a formatter instance.
   *
   * @param message - Unknown message object to validate and format
   * @param options - Optional format configuration
   * @returns Formatted response with validated and formatted content
   *
   * @example
   * ```typescript
   * // Format unknown message from API
   * const formatted = ResponseFormatter.validateAndFormat(unknownMessage, {
   *   format: 'humanized',
   *   includeMetadata: true
   * });
   *
   * if (formatted.humanized) {
   *   console.log(formatted.humanized);
   * }
   * ```
   */
  public static validateAndFormat(
    message: unknown,
    options: ResponseFormatOptions = {}
  ): FormattedResponse {
    const formatter = new ResponseFormatter(options);

    // Try to parse as different message types
    const taskResponseResult = TaskResponseMessageSchema.safeParse(message);
    if (taskResponseResult.success) {
      return formatter.formatTaskResponse(taskResponseResult.data);
    }

    const agentSelectedResult = AgentSelectedMessageSchema.safeParse(message);
    if (agentSelectedResult.success) {
      return formatter.formatAgentSelected(agentSelectedResult.data);
    }

    const errorResult = ErrorMessageSchema.safeParse(message);
    if (errorResult.success) {
      return formatter.formatError(errorResult.data);
    }

    // Default to base message format
    return formatter.format(message as BaseMessage);
  }
}
