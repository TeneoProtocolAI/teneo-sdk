/**
 * Message Handler Registry
 * Central registry for message handlers - eliminates shotgun surgery when adding new message types
 */

import { BaseMessage, MessageType, Logger } from "../types";
import {
  MessageHandler,
  HandlerContext,
  HandlerRegistrationOptions
} from "./message-handlers/types";
import { ValidationError } from "../types/events";

/**
 * Registry for message handlers
 * Stores handlers by message type and routes messages to appropriate handlers
 */
export class MessageHandlerRegistry {
  private readonly handlers = new Map<MessageType, MessageHandler>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Registers a message handler for a specific message type.
   * Prevents duplicate registration unless replace option is true.
   * Enables extensible message processing following Open/Closed Principle.
   *
   * @param handler - The handler to register (must have unique type)
   * @param options - Registration options
   * @param options.replace - Whether to replace existing handler (default: false)
   *
   * @example
   * ```typescript
   * const customHandler = new CustomMessageHandler();
   * registry.register(customHandler);
   *
   * // Replace existing handler
   * registry.register(newHandler, { replace: true });
   * ```
   */
  public register(handler: MessageHandler, options: HandlerRegistrationOptions = {}): void {
    const { replace = false } = options;

    // Check if handler already exists
    if (this.handlers.has(handler.type) && !replace) {
      this.logger.warn(
        `Handler for ${handler.type} already registered, skipping. Use replace:true to override.`
      );
      return;
    }

    this.handlers.set(handler.type, handler);
    this.logger.debug(`Registered handler for message type: ${handler.type}`);
  }

  /**
   * Registers multiple message handlers at once.
   * Convenient for bulk registration of default or custom handlers.
   * Uses same registration logic as register() for each handler.
   *
   * @param handlers - Array of handlers to register
   * @param options - Registration options applied to all handlers
   *
   * @example
   * ```typescript
   * const handlers = [
   *   new TaskResponseHandler(),
   *   new AgentSelectedHandler(),
   *   new ErrorHandler()
   * ];
   * registry.registerAll(handlers);
   * ```
   */
  public registerAll(handlers: MessageHandler[], options: HandlerRegistrationOptions = {}): void {
    for (const handler of handlers) {
      this.register(handler, options);
    }
  }

  /**
   * Unregisters a handler for a specific message type.
   * Returns whether a handler was actually removed.
   *
   * @param type - The message type to unregister
   * @returns True if handler was removed, false if no handler existed
   *
   * @example
   * ```typescript
   * const removed = registry.unregister('task_response');
   * if (removed) {
   *   console.log('Handler removed successfully');
   * }
   * ```
   */
  public unregister(type: MessageType): boolean {
    const result = this.handlers.delete(type);
    if (result) {
      this.logger.debug(`Unregistered handler for message type: ${type}`);
    }
    return result;
  }

  /**
   * Checks if a handler is registered for a specific message type.
   * Useful for conditional logic based on handler availability.
   *
   * @param type - The message type to check
   * @returns True if handler exists, false otherwise
   *
   * @example
   * ```typescript
   * if (registry.has('task_response')) {
   *   console.log('Task response handler is registered');
   * }
   * ```
   */
  public has(type: MessageType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Gets a registered handler for a specific message type.
   * Returns undefined if no handler is registered for the type.
   *
   * @param type - The message type to get handler for
   * @returns The handler if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const handler = registry.get('task_response');
   * if (handler) {
   *   console.log(`Handler found: ${handler.type}`);
   * }
   * ```
   */
  public get(type: MessageType): MessageHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Routes a message to its appropriate handler based on message type.
   * Validates handler can process the message before delegating.
   * Catches and logs handler errors, wrapping them in ValidationError.
   *
   * @param message - The message to handle
   * @param context - Handler context with dependencies (logger, emit, etc.)
   * @returns Promise that resolves when message is handled
   * @throws {ValidationError} If handler throws an error during processing
   *
   * @example
   * ```typescript
   * const message = { type: 'task_response', ... };
   * const context = createHandlerContext();
   * await registry.handle(message, context);
   * ```
   */
  public async handle(message: BaseMessage, context: HandlerContext): Promise<void> {
    // Check for pending message responses first (handled by caller)
    if (message.id) {
      // Let caller handle response matching
      this.logger.debug(
        `Message ${message.id} may be a response - caller should check pending messages`
      );
    }

    // Find handler for this message type
    const handler = this.handlers.get(message.type);

    if (!handler) {
      this.logger.debug(`No handler registered for message type: ${message.type}`);
      // Not an error - some message types don't need handling
      return;
    }

    // Verify handler can handle this message
    if (!handler.canHandle(message)) {
      this.logger.warn(`Handler for ${message.type} returned false for canHandle()`);
      return;
    }

    // Delegate to handler
    this.logger.debug(`Routing ${message.type} message to handler`);
    try {
      await handler.handle(message, context);
    } catch (error) {
      this.logger.error(`Handler for ${message.type} threw error`, error);
      throw new ValidationError(`Handler for ${message.type} failed`, error);
    }
  }

  /**
   * Gets an array of all currently registered message types.
   * Useful for introspection and debugging handler configuration.
   *
   * @returns Array of message types that have registered handlers
   *
   * @example
   * ```typescript
   * const types = registry.getRegisteredTypes();
   * console.log(`Registered handlers: ${types.join(', ')}`);
   * ```
   */
  public getRegisteredTypes(): MessageType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Gets the total number of registered handlers.
   * Convenience getter for handler count.
   *
   * @returns Number of registered handlers
   *
   * @example
   * ```typescript
   * console.log(`${registry.size} handlers registered`);
   * ```
   */
  public get size(): number {
    return this.handlers.size;
  }

  /**
   * Clears all registered handlers from the registry.
   * Useful for testing or resetting handler configuration.
   *
   * @example
   * ```typescript
   * registry.clear();
   * console.log('All handlers cleared');
   * ```
   */
  public clear(): void {
    this.handlers.clear();
    this.logger.debug("Cleared all message handlers");
  }
}
