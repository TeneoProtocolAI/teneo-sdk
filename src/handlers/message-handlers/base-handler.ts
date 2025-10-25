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
      const validated = this.validate(message);

      // Call subclass implementation
      await this.handleValidated(validated, context);
    } catch (error) {
      context.logger.error(`Error handling ${this.type} message`, error);
      this.onError(error, message, context);
    }
  }

  /**
   * Validate message against schema
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
  protected emit(context: HandlerContext, event: string, ...args: any[]): void {
    context.emit(event, ...args);
  }

  /**
   * Helper: send webhook (fire-and-forget pattern)
   */
  protected sendWebhook(context: HandlerContext, type: string, data: any, metadata?: any): void {
    // Fire and forget - don't block event emission
    context.sendWebhook(type as any, data, metadata).catch((error) => {
      context.logger.error(`Failed to send webhook for ${this.type}`, error);
    });
  }

  /**
   * Helper: update connection state
   */
  protected updateConnectionState(context: HandlerContext, update: any): void {
    context.updateConnectionState(update);
  }

  /**
   * Helper: update auth state
   */
  protected updateAuthState(context: HandlerContext, update: any): void {
    context.updateAuthState(update);
  }
}
