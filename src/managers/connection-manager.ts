/**
 * ConnectionManager - Manages WebSocket connection lifecycle
 * Handles connection, disconnection, and state management
 */

import { EventEmitter } from "eventemitter3";
import { WebSocketClient } from "../core/websocket-client";
import { ConnectionState, AuthenticationState, Logger } from "../types";
import { SDKEvents } from "../types/events";

export class ConnectionManager extends EventEmitter<SDKEvents> {
  private readonly wsClient: WebSocketClient;
  private readonly logger: Logger;

  constructor(wsClient: WebSocketClient, logger: Logger) {
    super();
    this.wsClient = wsClient;
    this.logger = logger;
    this.setupEventForwarding();
  }

  /**
   * Initiates WebSocket connection through the underlying WebSocket client.
   * Delegates all connection logic including authentication and reconnection.
   *
   * @returns Promise that resolves when connection and authentication complete
   * @throws {TimeoutError} If connection times out
   * @throws {ConnectionError} If WebSocket connection fails
   * @throws {AuthenticationError} If authentication fails
   *
   * @example
   * ```typescript
   * const connectionMgr = new ConnectionManager(wsClient, logger);
   * await connectionMgr.connect();
   * console.log('Connected via connection manager');
   * ```
   */
  public async connect(): Promise<void> {
    this.logger.info("ConnectionManager: Initiating connection");
    await this.wsClient.connect();
  }

  /**
   * Disconnects from the WebSocket server through the underlying WebSocket client.
   * Cleans up all connection resources and stops reconnection attempts.
   *
   * @example
   * ```typescript
   * connectionMgr.disconnect();
   * console.log('Disconnected');
   * ```
   */
  public disconnect(): void {
    this.logger.info("ConnectionManager: Disconnecting");
    this.wsClient.disconnect();
  }

  /**
   * Gets the current WebSocket connection state with detailed status information.
   * Includes connection status, reconnection attempts, and error information.
   *
   * @returns Connection state object with status, attempts, and timestamps
   *
   * @example
   * ```typescript
   * const state = connectionMgr.getConnectionState();
   * console.log(`Connected: ${state.connected}`);
   * console.log(`Reconnecting: ${state.reconnecting}`);
   * ```
   */
  public getConnectionState(): ConnectionState {
    return this.wsClient.getConnectionState();
  }

  /**
   * Gets the current authentication state with wallet and room information.
   * Includes authentication status, wallet address, and accessible rooms.
   *
   * @returns Authentication state object with wallet, challenge, and room access
   *
   * @example
   * ```typescript
   * const authState = connectionMgr.getAuthState();
   * if (authState.authenticated) {
   *   console.log(`Authenticated as: ${authState.walletAddress}`);
   * }
   * ```
   */
  public getAuthState(): AuthenticationState {
    return this.wsClient.getAuthState();
  }

  /**
   * Quick check for whether the WebSocket is currently connected.
   * Convenience getter for immediate connection status.
   *
   * @returns True if connected, false otherwise
   *
   * @example
   * ```typescript
   * if (connectionMgr.isConnected) {
   *   console.log('Ready to send messages');
   * }
   * ```
   */
  public get isConnected(): boolean {
    return this.wsClient.isConnected;
  }

  /**
   * Quick check for whether authentication is complete.
   * Convenience getter for immediate authentication status.
   *
   * @returns True if authenticated, false otherwise
   *
   * @example
   * ```typescript
   * if (connectionMgr.isAuthenticated) {
   *   console.log('Authenticated and ready');
   * }
   * ```
   */
  public get isAuthenticated(): boolean {
    return this.wsClient.isAuthenticated;
  }

  /**
   * Gets the underlying WebSocket client instance for advanced usage.
   * Provides direct access to low-level WebSocket operations.
   *
   * ⚠️ **WARNING:** This method returns a direct reference to the internal WebSocketClient.
   * Modifying the client's state or calling methods directly may lead to unexpected behavior
   * or break SDK functionality. Use this only for read-only operations like event listening.
   *
   * @internal This method is for internal SDK use and advanced scenarios
   * @returns The WebSocketClient instance (direct reference - use with caution)
   *
   * @example
   * ```typescript
   * // Advanced usage - listen to low-level events (read-only)
   * const wsClient = connectionMgr.getWebSocketClient();
   * wsClient.on('message:received', (msg) => console.log(msg));
   * ```
   */
  public getWebSocketClient(): WebSocketClient {
    return this.wsClient;
  }

  /**
   * Set up event forwarding from WebSocket client
   */
  private setupEventForwarding(): void {
    // Forward connection events
    this.wsClient.on("connection:open", () => this.emit("connection:open"));
    this.wsClient.on("connection:close", (code, reason) =>
      this.emit("connection:close", code, reason)
    );
    this.wsClient.on("connection:error", (error) => this.emit("connection:error", error));
    this.wsClient.on("connection:reconnecting", (attempt) =>
      this.emit("connection:reconnecting", attempt)
    );
    this.wsClient.on("connection:reconnected", () => this.emit("connection:reconnected"));
    this.wsClient.on("connection:state", (state) => this.emit("connection:state", state));

    // Forward auth events
    this.wsClient.on("auth:challenge", (challenge) => this.emit("auth:challenge", challenge));
    this.wsClient.on("auth:success", (state) => this.emit("auth:success", state));
    this.wsClient.on("auth:error", (error) => this.emit("auth:error", error));
    this.wsClient.on("auth:state", (state) => this.emit("auth:state", state));

    // Forward lifecycle events
    this.wsClient.on("ready", () => this.emit("ready"));
    this.wsClient.on("disconnect", () => this.emit("disconnect"));

    // Forward error events
    this.wsClient.on("error", (error) => this.emit("error", error));
  }

  /**
   * Destroys the connection manager and cleans up all resources.
   * Disconnects from the server and removes all event listeners.
   * After destruction, the manager cannot be reused.
   *
   * @example
   * ```typescript
   * connectionMgr.destroy();
   * console.log('Connection manager destroyed');
   * ```
   */
  public destroy(): void {
    this.logger.info("ConnectionManager: Destroying");
    this.disconnect();
    this.removeAllListeners();
  }
}
