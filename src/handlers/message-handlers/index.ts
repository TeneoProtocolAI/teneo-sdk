/**
 * Message handlers index
 * Exports all message handlers and provides convenience functions
 */

// Export types
export * from "./types";
export * from "./base-handler";

// Export all handlers
export { TaskResponseHandler } from "./task-response-handler";
export { AgentSelectedHandler } from "./agent-selected-handler";
export { ChallengeHandler } from "./challenge-handler";
export { AuthMessageHandler } from "./auth-message-handler";
export { AuthSuccessHandler } from "./auth-success-handler";
export { AuthErrorHandler } from "./auth-error-handler";
export { AuthRequiredHandler } from "./auth-required-handler";
export { AgentsListHandler } from "./agents-list-handler";
export { ErrorMessageHandler } from "./error-message-handler";
export { RegularMessageHandler } from "./regular-message-handler";
export { PingHandler, PongHandler } from "./ping-pong-handler";
export { SubscribeResponseHandler } from "./subscribe-response-handler";
export { UnsubscribeResponseHandler } from "./unsubscribe-response-handler";
export { ListRoomsResponseHandler } from "./list-rooms-response-handler";

// Import for convenience function
import { TaskResponseHandler } from "./task-response-handler";
import { AgentSelectedHandler } from "./agent-selected-handler";
import { ChallengeHandler } from "./challenge-handler";
import { AuthMessageHandler } from "./auth-message-handler";
import { AuthSuccessHandler } from "./auth-success-handler";
import { AuthErrorHandler } from "./auth-error-handler";
import { AuthRequiredHandler } from "./auth-required-handler";
import { AgentsListHandler } from "./agents-list-handler";
import { ErrorMessageHandler } from "./error-message-handler";
import { RegularMessageHandler } from "./regular-message-handler";
import { PingHandler, PongHandler } from "./ping-pong-handler";
import { SubscribeResponseHandler } from "./subscribe-response-handler";
import { UnsubscribeResponseHandler } from "./unsubscribe-response-handler";
import { ListRoomsResponseHandler } from "./list-rooms-response-handler";
import { MessageHandler } from "./types";

/**
 * Get all default message handlers
 * @param clientType - The client type for authentication (default: "user")
 * @returns Array of all default handlers
 */
export function getDefaultHandlers(
  clientType: "user" | "agent" | "coordinator" = "user"
): MessageHandler[] {
  return [
    // Authentication handlers
    new ChallengeHandler(clientType),
    new AuthMessageHandler(),
    new AuthSuccessHandler(),
    new AuthErrorHandler(),
    new AuthRequiredHandler(),

    // Agent/coordinator handlers
    new TaskResponseHandler(),
    new AgentSelectedHandler(),
    new AgentsListHandler(),

    // Message handlers
    new RegularMessageHandler(),
    new ErrorMessageHandler(),

    // Room handlers
    new SubscribeResponseHandler(),
    new UnsubscribeResponseHandler(),
    new ListRoomsResponseHandler(),

    // Keepalive handlers
    new PingHandler(),
    new PongHandler()
  ];
}
