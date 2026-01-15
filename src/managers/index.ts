/**
 * Manager exports
 * Provides focused classes for different SDK responsibilities
 */

export { ConnectionManager } from "./connection-manager";
export { RoomManager } from "./room-manager";
export { RoomManagementManager } from "./room-management-manager";
export { AgentRoomManager, type AgentRoomInfo } from "./agent-room-manager";
export { AgentRegistry } from "./agent-registry";
export {
  MessageRouter,
  type SendMessageOptions,
  type AgentCommand,
  type QuoteResult,
  type MessageRouterConfig
} from "./message-router";
export {
  AdminManager,
  type AdminManagerEvents,
  type ListAllAgentsOptions,
  type AllAgentsResult
} from "./admin-manager";
