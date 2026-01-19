/**
 * AdminManager - Manages admin-only features
 * Provides access to admin APIs like listing all agents, user counts, etc.
 * Only available to users with admin privileges.
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { Logger, AdminAgentInfo, UserCountData } from "../types";
import { SDKError } from "../types/events";
import { ErrorCode } from "../types/error-codes";

/**
 * Events emitted by the AdminManager
 */
export interface AdminManagerEvents {
  /** Emitted when user count is updated (broadcast to admins) */
  user_count: (data: UserCountData) => void;
  /** Emitted when admin status changes */
  status_changed: (isAdmin: boolean) => void;
}

/**
 * Options for listing all agents (admin only)
 */
export interface ListAllAgentsOptions {
  /** Filter string for agent search */
  filter?: string;
  /** Pagination offset */
  offset?: number;
  /** Number of agents to return (default: 50) */
  limit?: number;
}

/**
 * Response from listing all agents
 */
export interface AllAgentsResult {
  /** List of agents */
  agents: AdminAgentInfo[];
  /** Total number of agents matching filter */
  total: number;
  /** Current offset */
  offset: number;
  /** Page size */
  limit: number;
  /** Whether there are more agents to load */
  hasMore: boolean;
  /** Applied filter (if any) */
  filter?: string;
}

/**
 * Pending request waiting for response
 */
interface PendingRequest<T> {
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AdminManager extends EventEmitter<AdminManagerEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;
  private _isAdmin: boolean = false;
  private readonly pendingListRequests = new Map<string, PendingRequest<AllAgentsResult>>();
  private lastUserCount: UserCountData | null = null;

  /** Default timeout for requests (30 seconds) */
  private readonly requestTimeout = 30000;

  constructor(wsClient: WebSocketClient, logger: Logger) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
  }

  /**
   * Whether the current user has admin privileges.
   */
  public get isAdmin(): boolean {
    return this._isAdmin;
  }

  /**
   * Sets the admin status. Called internally after authentication.
   * @internal
   */
  public setAdminStatus(isAdmin: boolean): void {
    const changed = this._isAdmin !== isAdmin;
    this._isAdmin = isAdmin;

    if (changed) {
      this.logger.info("AdminManager: Admin status changed", { isAdmin });
      this.emit("status_changed", isAdmin);
    }
  }

  /**
   * Lists all agents in the network (admin only).
   * Returns paginated list of agents with full admin information.
   *
   * @param options - Pagination and filter options
   * @returns Promise that resolves with agents list
   * @throws {SDKError} If not connected or not an admin
   *
   * @example
   * ```typescript
   * if (sdk.admin?.isAdmin) {
   *   const result = await sdk.admin.listAllAgents({ limit: 20 });
   *   console.log(`Found ${result.total} agents`);
   *   result.agents.forEach(agent => {
   *     console.log(`${agent.agent_name}: verified=${agent.is_verified}, banned=${agent.is_banned}`);
   *   });
   * }
   * ```
   */
  public async listAllAgents(options: ListAllAgentsOptions = {}): Promise<AllAgentsResult> {
    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    if (!this._isAdmin) {
      throw new SDKError("Admin privileges required", ErrorCode.AUTH_ERROR);
    }

    const { filter, offset = 0, limit = 50 } = options;

    this.logger.info("AdminManager: Listing all agents", { filter, offset, limit });

    // Generate request ID
    const requestId = `admin_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Send list_all_agents message
    const message = {
      type: "list_all_agents" as const,
      filter,
      offset,
      limit,
      request_id: requestId
    };

    await this.wsClient.sendMessage(message);

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingListRequests.delete(requestId);
        reject(new SDKError("List agents request timed out", ErrorCode.TIMEOUT_ERROR));
      }, this.requestTimeout);

      this.pendingListRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Gets the last received user count.
   *
   * @returns The last user count data, or null if not received yet
   */
  public getLastUserCount(): UserCountData | null {
    return this.lastUserCount;
  }

  /**
   * Handles incoming all_agents_response message from server.
   * @internal
   */
  public handleAllAgentsResponse(
    data: {
      agents: AdminAgentInfo[];
      total: number;
      offset: number;
      limit: number;
      has_more: boolean;
      filter?: string;
    },
    requestId?: string
  ): void {
    this.logger.debug("AdminManager: Received agents list", {
      count: data.agents.length,
      total: data.total,
      requestId
    });

    const result: AllAgentsResult = {
      agents: data.agents,
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      hasMore: data.has_more,
      filter: data.filter
    };

    // Resolve pending request - prefer matching by request_id if available
    if (requestId && this.pendingListRequests.has(requestId)) {
      // Exact match by request_id (preferred)
      const pending = this.pendingListRequests.get(requestId)!;
      clearTimeout(pending.timeout);
      this.pendingListRequests.delete(requestId);
      pending.resolve(result);
    } else if (this.pendingListRequests.size > 0) {
      // Fallback to FIFO for backwards compatibility (when server doesn't echo request_id)
      const pendingEntries = Array.from(this.pendingListRequests.entries());
      const [fallbackRequestId, pending] = pendingEntries[0];
      this.logger.warn("AdminManager: Using FIFO fallback for list agents correlation", {
        pendingCount: pendingEntries.length
      });
      clearTimeout(pending.timeout);
      this.pendingListRequests.delete(fallbackRequestId);
      pending.resolve(result);
    }
  }

  /**
   * Handles incoming user_count message from server.
   * @internal
   */
  public handleUserCount(data: UserCountData): void {
    this.logger.debug("AdminManager: Received user count", { count: data.count });

    this.lastUserCount = data;
    this.emit("user_count", data);
  }

  /**
   * Clears all cached data and pending requests.
   */
  public clear(): void {
    // Clear pending requests
    for (const [, pending] of this.pendingListRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new SDKError("Admin manager cleared", ErrorCode.SDK_DESTROYED));
    }
    this.pendingListRequests.clear();

    this.lastUserCount = null;
  }

  /**
   * Destroys the admin manager and cleans up resources.
   */
  public destroy(): void {
    this.logger.info("AdminManager: Destroying");
    this.clear();
    this._isAdmin = false;
    this.removeAllListeners();
  }
}
