/**
 * Base abstract class for message handlers
 * Implements the template method pattern for consistent message handling
 */

import { z } from "zod";
import { BaseMessage, MessageType } from "../../types";
import { MessageHandler, HandlerContext } from "./types";

/**
 * Abstract base class for message handlers
 * Provides common functionality and enforces consistent structure
 */
export abstract class BaseMessageHandler<T extends BaseMessage = BaseMessage>
  implements MessageHandler<T>
{
  // Subclasses must define these
  abstract readonly type: MessageType;
  abstract readonly schema: z.ZodSchema<T>;

  /**
   * Check if this handler can handle the given message
   */
  public canHandle(message: BaseMessage): boolean {
    return message.type === this.type;
  }

  /**
   * Main handle method - implements template method pattern
   * 1. Validates message
   * 2. Calls handleValidated (implemented by subclasses)
   * 3. Handles errors
   */
  public async handle(message: BaseMessage, context: HandlerContext): Promise<void> {
    try {
      // Validate message with Zod schema
      const result = this.schema.safeParse(message);
      if (!result.success) {
        // Log validation errors at debug level only (hidden from end users)
        context.logger.debug(`${this.type} message validation warning`, {
          error: result.error.message
        });
      }

      // Process message even if validation failed (resilience)
      // Use validated data if available, otherwise use raw message
      const messageToProcess = result.success ? result.data : (message as T);

      // Call subclass implementation with additional error protection
      try {
        await this.handleValidated(messageToProcess, context);
      } catch (handlerError) {
        // Catch errors from handlers accessing malformed data
        context.logger.warn(`Handler ${this.type} failed to process message`, {
          error: handlerError instanceof Error ? handlerError.message : String(handlerError),
          messageType: message.type
        });
        // Don't re-throw - resilient processing continues
      }
    } catch (error) {
      context.logger.error(`Error handling ${this.type} message`, error);
      this.onError(error, message, context);
    }
  }

  /**
   * Validate message against schema (deprecated - validation now inline in handle())
   * @deprecated Validation is now done inline in handle() method
   */
  protected validate(message: BaseMessage): T {
    const result = this.schema.safeParse(message);
    if (!result.success) {
      throw new Error(`Invalid ${this.type} message: ${result.error.message}`);
    }
    return result.data;
  }

  /**
   * Handle validated message - implemented by subclasses
   */
  protected abstract handleValidated(message: T, context: HandlerContext): Promise<void> | void;

  /**
   * Handle errors - can be overridden by subclasses
   */
  protected onError(error: unknown, message: BaseMessage, context: HandlerContext): void {
    // Default: emit error event
    context.emit("message:error", error, message);
  }

  /**
   * Helper: emit event
   */
  protected emit(context: HandlerContext, event: string, ...args: unknown[]): void {
    context.emit(event, ...args);
  }

  /**
   * Helper: send webhook (fire-and-forget pattern)
   */
  protected sendWebhook(
    context: HandlerContext,
    type: string,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): void {
    // Fire and forget - don't block event emission
    context
      .sendWebhook(type as Parameters<typeof context.sendWebhook>[0], data, metadata)
      .catch((error) => {
        context.logger.error(`Failed to send webhook for ${this.type}`, error);
      });
  }

  /**
   * Helper: update connection state
   */
  protected updateConnectionState(
    context: HandlerContext,
    update: Partial<import("./types").ConnectionState>
  ): void {
    context.updateConnectionState(update);
  }

  /**
   * Helper: update auth state
   */
  protected updateAuthState(
    context: HandlerContext,
    update: Partial<import("./types").AuthState>
  ): void {
    context.updateAuthState(update);
  }
}
