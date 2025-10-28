/**
 * Main Teneo Protocol SDK class
 * Provides a unified interface for external platforms to interact with Teneo agents
 * Uses manager classes to follow Single Responsibility Principle
 */

import { EventEmitter } from "eventemitter3";
import { z } from "zod";
import {
  SDKConfig,
  PartialSDKConfig,
  PartialSDKConfigSchema,
  SDKConfigBuilder,
  Agent,
  Room,
  RoomInfo,
  Logger,
  validateConfig,
  DEFAULT_CONFIG,
  ResponseFormatSchema,
  type HealthStatus
} from "./types";
import { SDKEvents, SDKError } from "./types/events";
import { ErrorCode } from "./types/error-codes";
import { WebSocketClient } from "./core/websocket-client";
import { WebhookHandler } from "./handlers/webhook-handler";
import {
  ResponseFormatter,
  FormattedResponse,
  ResponseFormatOptions
} from "./formatters/response-formatter";
import {
  ConnectionManager,
  RoomManager,
  AgentRegistry,
  MessageRouter,
  SendMessageOptions,
  AgentCommand
} from "./managers";
import { createPinoLogger } from "./utils/logger";
import { RoomIdSchema, AgentIdSchema, AgentCommandContentSchema } from "./types/validation";

// Re-export types for external use
export type { SendMessageOptions, AgentCommand };

// Zod schemas for SDK-specific interfaces
export const SendMessageOptionsSchema = z.object({
  room: RoomIdSchema.optional(),
  from: z.string().optional(),
  waitForResponse: z.boolean().optional(),
  timeout: z.number().min(1000).max(300000).optional(),
  format: z.union([ResponseFormatSchema, z.literal("raw"), z.literal("humanized")]).optional()
});

export const AgentCommandSchema = z.object({
  agent: AgentIdSchema,
  command: AgentCommandContentSchema,
  room: RoomIdSchema.optional()
});

export class TeneoSDK extends EventEmitter<SDKEvents> {
  private config: SDKConfig;
  private readonly logger: Logger;
  private isDestroyed = false;

  // Core components
  private readonly wsClient: WebSocketClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly responseFormatter: ResponseFormatter;

  // Managers
  private readonly connection: ConnectionManager;
  private readonly rooms: RoomManager;
  private readonly agents: AgentRegistry;
  private readonly messages: MessageRouter;

  /**
   * Creates a new instance of the Teneo Protocol SDK.
   * Initializes all core components, managers, and validates the provided configuration.
   * The SDK handles WebSocket connections, authentication, message routing, and webhook delivery.
   *
   * @param config - Partial SDK configuration object (only wsUrl is required)
   * @param config.wsUrl - WebSocket URL to connect to (e.g., 'wss://teneo.example.com')
   * @param config.privateKey - Optional Ethereum private key for wallet-based authentication
   * @param config.walletAddress - Optional wallet address (derived from privateKey if not provided)
   * @param config.autoJoinRooms - Optional array of room IDs to subscribe to automatically on connection
   * @param config.webhookUrl - Optional webhook URL for receiving event notifications
   * @param config.reconnect - Enable automatic reconnection (default: true)
   * @param config.logLevel - Logging level: 'debug', 'info', 'warn', 'error', 'silent' (default: 'info')
   * @param config.responseFormat - Response format: 'raw', 'humanized', 'both' (default: 'humanized')
   *
   * @throws {SDKError} If configuration is invalid (ErrorCode.INVALID_CONFIG)
   *
   * @example
   * ```typescript
   * // Minimal configuration
   * const sdk = new TeneoSDK({
   *   wsUrl: 'wss://teneo.example.com',
   *   privateKey: '0x...'
   * });
   *
   * // Full configuration
   * const sdk = new TeneoSDK({
   *   wsUrl: 'wss://teneo.example.com',
   *   privateKey: '0x...',
   *   autoJoinRooms: ['general', 'announcements'],
   *   webhookUrl: 'https://api.example.com/webhooks',
   *   logLevel: 'debug',
   *   responseFormat: 'both',
   *   reconnect: true,
   *   maxReconnectAttempts: 10
   * });
   *
   * // Using builder pattern (recommended for complex configs)
   * const sdk = TeneoSDK.builder()
   *   .wsUrl('wss://teneo.example.com')
   *   .privateKey('0x...')
   *   .withAutoJoinRooms(['general'])
   *   .build();
   * ```
   *
   * @see {@link SDKConfigBuilder} for fluent configuration API
   * @see {@link TeneoSDK.builder} for creating a configuration builder
   */
  constructor(config: PartialSDKConfig) {
    super();

    try {
      // Validate partial config first
      const partialConfig = PartialSDKConfigSchema.parse(config);

      // Merge with defaults
      const fullConfig = { ...DEFAULT_CONFIG, ...partialConfig };

      // Validate full configuration
      this.config = validateConfig(fullConfig);

      // Initialize logger
      this.logger = this.config.logger ?? this.createDefaultLogger();

      // Initialize core components
      this.wsClient = new WebSocketClient(this.config);
      this.webhookHandler = new WebhookHandler(this.config, this.logger);
      this.responseFormatter = new ResponseFormatter({
        format: this.config.responseFormat ?? "humanized",
        includeMetadata: this.config.includeMetadata ?? false
      });

      // Initialize managers
      this.connection = new ConnectionManager(this.wsClient, this.logger);
      this.rooms = new RoomManager(this.wsClient, this.logger);
      this.wsClient.setRoomManager(this.rooms); // Enable subscription tracking in handlers
      this.agents = new AgentRegistry(this.logger);
      this.messages = new MessageRouter(
        this.wsClient,
        this.webhookHandler,
        this.responseFormatter,
        this.logger,
        {
          messageTimeout: this.config.messageTimeout,
          responseFormat: this.config.responseFormat
        }
      );

      // Set up event forwarding
      this.setupEventForwarding();

      this.logger.info("TeneoSDK initialized", { wsUrl: this.config.wsUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SDKError("Invalid SDK configuration", ErrorCode.INVALID_CONFIG, error, false);
      }
      throw error;
    }
  }

  /**
   * Establishes a connection to the Teneo network via WebSocket.
   * Handles authentication automatically and joins any configured auto-join rooms.
   * Emits 'connection:open', 'auth:success', and 'ready' events on successful connection.
   *
   * @returns Promise that resolves when connection and authentication are complete
   * @throws {SDKError} If the SDK has been destroyed (ErrorCode.SDK_DESTROYED)
   * @throws {ConnectionError} If WebSocket connection fails
   * @throws {AuthenticationError} If authentication fails
   *
   * @example
   * ```typescript
   * const sdk = new TeneoSDK({ wsUrl: 'wss://example.com', privateKey: '0x...' });
   * await sdk.connect();
   * console.log('Connected to Teneo network');
   * ```
   */
  public async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    try {
      this.logger.info("Connecting to Teneo network");
      await this.connection.connect();

      // Auto-join rooms if configured
      if (this.config.autoJoinRooms && this.config.autoJoinRooms.length > 0) {
        for (const room of this.config.autoJoinRooms) {
          await this.rooms.subscribeToRoom(room);
        }
      }

      this.logger.info("Successfully connected to Teneo network");
    } catch (error) {
      this.logger.error("Failed to connect to Teneo network", error);
      throw error;
    }
  }

  /**
   * Disconnects from the Teneo network and cleans up all active connections.
   * Clears all timers, pending messages, and stops automatic reconnection attempts.
   * Emits 'disconnect' event after disconnection is complete.
   *
   * @example
   * ```typescript
   * sdk.disconnect();
   * console.log('Disconnected from Teneo network');
   * ```
   */
  public disconnect(): void {
    this.logger.info("Disconnecting from Teneo network");
    this.connection.disconnect();
  }

  /**
   * Sends a message to agents via the coordinator, which intelligently selects
   * the most appropriate agent based on the message content and agent capabilities.
   * Can optionally wait for and return the agent's response.
   *
   * @param content - The message content to send to agents
   * @param options - Optional message configuration
   * @param options.room - Room to send message to (defaults to configured default room)
   * @param options.from - Sender address (defaults to authenticated wallet address)
   * @param options.waitForResponse - Whether to wait for agent response (default: false)
   * @param options.timeout - Response timeout in milliseconds (default: 60000, max: 300000)
   * @param options.format - Response format: 'raw', 'humanized', or 'both'
   * @returns Promise that resolves to FormattedResponse if waitForResponse is true, void otherwise
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If content is empty or options are invalid
   * @throws {TimeoutError} If waitForResponse is true and timeout is exceeded
   *
   * @example
   * ```typescript
   * // Fire-and-forget message
   * await sdk.sendMessage('What is the weather today?');
   *
   * // Wait for response
   * const response = await sdk.sendMessage('What is 2+2?', {
   *   waitForResponse: true,
   *   timeout: 30000
   * });
   * console.log(response.humanized); // Agent's response in human-readable format
   * ```
   */
  public async sendMessage(
    content: string,
    options: SendMessageOptions
  ): Promise<FormattedResponse | void> {
    return this.messages.sendMessage(content, options);
  }

  /**
   * Sends a direct command to a specific agent, bypassing the coordinator.
   * Use this when you know exactly which agent should handle the request.
   * The command is formatted as "@agentName command" internally.
   *
   * @param command - The direct agent command configuration
   * @param command.agent - The agent ID or name to send the command to
   * @param command.command - The command text to send to the agent
   * @param command.room - Room to send command to (defaults to configured default room)
   * @returns Promise that resolves when the command is sent
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If agent or command are empty, or room is not configured
   *
   * @example
   * ```typescript
   * // Send command to specific agent
   * await sdk.sendDirectCommand({
   *   agent: 'weather-agent',
   *   command: 'Get forecast for New York',
   *   room: 'general'
   * });
   * ```
   */
  public async sendDirectCommand(command: AgentCommand): Promise<FormattedResponse | void> {
    return this.messages.sendDirectCommand(command);
  }

  /**
   * Subscribes to a specified room in the Teneo network.
   * Agents in the room will be able to see and respond to your messages.
   * Emits 'room:subscribed' event when successfully subscribed.
   *
   * @param roomId - The ID of the room to subscribe to
   * @returns Promise that resolves when the room has been subscribed
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * await sdk.subscribeToRoom('general');
   * console.log('Subscribed to general room');
   * ```
   */
  public async subscribeToRoom(roomId: string): Promise<void> {
    return this.rooms.subscribeToRoom(roomId);
  }

  /**
   * Unsubscribes from a specified room in the Teneo network.
   * You will no longer receive messages from agents in this room.
   * Emits 'room:unsubscribed' event when successfully unsubscribed.
   *
   * @param roomId - The ID of the room to unsubscribe from
   * @returns Promise that resolves when the room has been unsubscribed
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * await sdk.unsubscribeFromRoom('general');
   * console.log('Unsubscribed from general room');
   * ```
   */
  public async unsubscribeFromRoom(roomId: string): Promise<void> {
    return this.rooms.unsubscribeFromRoom(roomId);
  }

  /**
   * Lists all rooms available to the user.
   * Fetches room list from the server including owned and shared rooms.
   * Emits 'room:list' event when the list is received.
   *
   * @returns Promise that resolves to array of room information
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   *
   * @example
   * ```typescript
   * const rooms = await sdk.listRooms();
   * rooms.forEach(room => {
   *   console.log(`${room.name} (${room.is_public ? 'public' : 'private'})`);
   *   console.log(`Owner: ${room.is_owner}`);
   * });
   * ```
   */
  public async listRooms(): Promise<RoomInfo[]> {
    return this.rooms.listRooms();
  }

  /**
   * Gets all rooms currently subscribed to.
   * Returns array of room IDs that you're actively listening to for messages.
   *
   * @returns Array of subscribed room IDs
   *
   * @example
   * ```typescript
   * const rooms = sdk.getSubscribedRooms();
   * console.log(`Subscribed to ${rooms.length} rooms:`, rooms);
   * // Example output: Subscribed to 3 rooms: ['general', 'support', 'trading']
   * ```
   */
  public getSubscribedRooms(): string[] {
    return this.rooms.getSubscribedRooms();
  }

  /**
   * Gets a list of all available agents in the Teneo network.
   * The list is automatically updated when new agents join or leave.
   * Returns a read-only array to prevent external modification.
   *
   * @returns Read-only array of all available agents
   *
   * @example
   * ```typescript
   * const agents = sdk.getAgents();
   * console.log(`Found ${agents.length} agents:`);
   * agents.forEach(agent => {
   *   console.log(`- ${agent.name}: ${agent.description}`);
   * });
   * ```
   */
  public getAgents(): ReadonlyArray<Agent> {
    return this.agents.getAgents();
  }

  /**
   * Gets a specific agent by its unique ID.
   * Returns undefined if no agent with the specified ID exists.
   *
   * @param agentId - The unique identifier of the agent to retrieve
   * @returns The agent object if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const agent = sdk.getAgent('weather-agent-001');
   * if (agent) {
   *   console.log(`Found agent: ${agent.name}`);
   *   console.log(`Status: ${agent.status}`);
   * } else {
   *   console.log('Agent not found');
   * }
   * ```
   */
  public getAgent(agentId: string): Agent | undefined {
    return this.agents.getAgent(agentId);
  }

  /**
   * Finds all agents that have a specific capability using O(1) indexed lookup (PERF-3).
   * Much faster than filtering through all agents manually.
   * Uses capability index for constant-time lookups regardless of agent count.
   *
   * @param capability - The capability name to search for (case-insensitive)
   * @returns Read-only array of agents with the specified capability
   * @throws {ValidationError} If capability name is invalid
   *
   * @example
   * ```typescript
   * // Find all weather-capable agents
   * const weatherAgents = sdk.findAgentsByCapability('weather-forecast');
   * console.log(`Found ${weatherAgents.length} weather agents`);
   *
   * weatherAgents.forEach(agent => {
   *   console.log(`- ${agent.name}: ${agent.description}`);
   * });
   * ```
   */
  public findAgentsByCapability(capability: string): ReadonlyArray<Agent> {
    return this.agents.findByCapability(capability);
  }

  /**
   * Finds agents by name using O(k) token-based search (PERF-3).
   * Supports partial matching - searches for tokens within agent names.
   * Tokenizes both the search query and agent names for flexible matching.
   *
   * @param name - Name or partial name to search for (case-insensitive)
   * @returns Read-only array of agents matching the search
   * @throws {ValidationError} If name is invalid
   *
   * @example
   * ```typescript
   * // Find all agents with "weather" in their name
   * const agents = sdk.findAgentsByName('weather');
   * // Matches: "Weather Agent", "Weather Forecast Bot", "Advanced Weather API", etc.
   *
   * console.log(`Found ${agents.length} agents matching 'weather'`);
   * ```
   */
  public findAgentsByName(name: string): ReadonlyArray<Agent> {
    return this.agents.findByName(name);
  }

  /**
   * Finds all agents with a specific status using O(1) indexed lookup (PERF-3).
   * Uses status index for constant-time lookups regardless of agent count.
   *
   * @param status - Agent status: 'online' or 'offline' (case-insensitive)
   * @returns Read-only array of agents with the specified status
   * @throws {ValidationError} If status is invalid
   *
   * @example
   * ```typescript
   * // Get all online agents
   * const onlineAgents = sdk.findAgentsByStatus('online');
   * console.log(`${onlineAgents.length} agents are currently online`);
   *
   * // Get offline agents
   * const offlineAgents = sdk.findAgentsByStatus('offline');
   * ```
   */
  public findAgentsByStatus(status: string): ReadonlyArray<Agent> {
    return this.agents.findByStatus(status);
  }

  /**
   * Gets a list of all available rooms in the Teneo network.
   * Includes rooms you have access to based on your authentication.
   * Returns a read-only array to prevent external modification.
   *
   * @returns Read-only array of all available rooms
   *
   * @example
   * ```typescript
   * const rooms = sdk.getRooms();
   * console.log(`Available rooms: ${rooms.length}`);
   * rooms.forEach(room => {
   *   console.log(`- ${room.id} (${room.name})`);
   * });
   * ```
   */
  public getRooms(): ReadonlyArray<Room> {
    return this.rooms.getRooms();
  }

  /**
   * Gets a specific room by its unique ID.
   * Returns undefined if no room with the specified ID exists or if you don't have access.
   *
   * @param roomId - The unique identifier of the room to retrieve
   * @returns The room object if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const room = sdk.getRoom('general');
   * if (room) {
   *   console.log(`Found room: ${room.name}`);
   *   console.log(`Members: ${room.members?.length ?? 0}`);
   * } else {
   *   console.log('Room not found or no access');
   * }
   * ```
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.getRoom(roomId);
  }

  /**
   * Configures webhook URL and headers for receiving real-time event notifications.
   * Webhooks allow you to receive events at your server endpoint via HTTP POST requests.
   * Events include messages, agent responses, errors, and connection state changes.
   *
   * @param url - The webhook URL endpoint to receive events (must be HTTPS unless localhost)
   * @param headers - Optional custom HTTP headers to include with webhook requests
   * @throws {WebhookError} If URL is invalid or insecure (non-HTTPS and not localhost)
   *
   * @example
   * ```typescript
   * sdk.configureWebhook('https://api.example.com/webhooks/teneo', {
   *   'Authorization': 'Bearer your-token',
   *   'X-Custom-Header': 'value'
   * });
   *
   * // Listen for webhook events
   * sdk.on('webhook:sent', (payload, url) => {
   *   console.log('Webhook sent:', payload.event);
   * });
   * ```
   */
  public configureWebhook(url: string, headers?: Record<string, string>): void {
    this.webhookHandler.configure({
      url,
      headers,
      retries: this.config.webhookRetries,
      timeout: this.config.webhookTimeout
    });
  }

  /**
   * Gets the current WebSocket connection state including connection status,
   * authentication status, reconnection attempts, and timestamps.
   *
   * @returns Object containing detailed connection state information
   * @returns {boolean} returns.connected - Whether WebSocket is currently connected
   * @returns {boolean} returns.authenticated - Whether authentication is complete
   * @returns {boolean} returns.reconnecting - Whether currently attempting to reconnect
   * @returns {number} returns.reconnectAttempts - Number of reconnection attempts made
   * @returns {Date} returns.lastConnectedAt - Timestamp of last successful connection
   * @returns {Date} returns.lastDisconnectedAt - Timestamp of last disconnection
   * @returns {Error} returns.lastError - Last error that occurred
   *
   * @example
   * ```typescript
   * const state = sdk.getConnectionState();
   * console.log(`Connected: ${state.connected}`);
   * console.log(`Authenticated: ${state.authenticated}`);
   * if (state.reconnecting) {
   *   console.log(`Reconnection attempts: ${state.reconnectAttempts}`);
   * }
   * ```
   */
  public getConnectionState() {
    return this.connection.getConnectionState();
  }

  /**
   * Gets the current authentication state including wallet address, rooms, and permissions.
   * Updated after successful authentication and includes user profile information.
   *
   * @returns Object containing detailed authentication state information
   * @returns {boolean} returns.authenticated - Whether authentication is complete
   * @returns {string} returns.walletAddress - Authenticated wallet address
   * @returns {string} returns.challenge - Authentication challenge string
   * @returns {string[]} returns.rooms - Array of room IDs the user has access to
   * @returns {Room[]} returns.roomObjects - Full room objects with details
   *
   * @example
   * ```typescript
   * const authState = sdk.getAuthState();
   * if (authState.authenticated) {
   *   console.log(`Authenticated as: ${authState.walletAddress}`);
   *   console.log(`Access to ${authState.rooms?.length ?? 0} rooms`);
   * } else {
   *   console.log('Not authenticated');
   * }
   * ```
   */
  public getAuthState() {
    return this.connection.getAuthState();
  }

  /**
   * Quick check for whether the WebSocket connection is currently active.
   * This is a convenience getter that returns only the connection status.
   * For detailed state information, use getConnectionState().
   *
   * @returns True if connected to the Teneo network, false otherwise
   *
   * @example
   * ```typescript
   * if (sdk.isConnected) {
   *   await sdk.sendMessage('Hello!');
   * } else {
   *   console.log('Not connected');
   *   await sdk.connect();
   * }
   * ```
   */
  public get isConnected(): boolean {
    return this.connection.isConnected;
  }

  /**
   * Quick check for whether authentication is complete.
   * This is a convenience getter that returns only the authentication status.
   * For detailed auth information, use getAuthState().
   *
   * @returns True if authenticated with the Teneo network, false otherwise
   *
   * @example
   * ```typescript
   * if (sdk.isAuthenticated) {
   *   console.log('Ready to send messages');
   * } else {
   *   console.log('Waiting for authentication...');
   * }
   * ```
   */
  public get isAuthenticated(): boolean {
    return this.connection.isAuthenticated;
  }

  /**
   * Configures how agent responses are formatted when received.
   * Supports raw JSON, humanized text, or both formats simultaneously.
   * Also controls metadata inclusion and pretty-printing options.
   *
   * @param options - Response formatting configuration options
   * @param options.format - Format type: 'raw' (JSON), 'humanized' (text), or 'both'
   * @param options.includeMetadata - Whether to include metadata in responses (timestamps, agent info, etc.)
   * @param options.includeTimestamps - Whether to include timestamps in formatted output
   * @param options.prettyPrint - Whether to pretty-print JSON output
   *
   * @example
   * ```typescript
   * // Get both raw JSON and humanized text
   * sdk.setResponseFormat({
   *   format: 'both',
   *   includeMetadata: true
   * });
   *
   * const response = await sdk.sendMessage('Hello', { waitForResponse: true });
   * console.log(response.humanized); // Human-readable text
   * console.log(response.raw);       // Original JSON
   * console.log(response.metadata);  // Timestamp, agent info, etc.
   * ```
   */
  public setResponseFormat(options: ResponseFormatOptions): void {
    // Update formatter with new options
    this.responseFormatter.setFormatOptions(options);

    // Update config if format is specified
    if (options.format !== undefined) {
      this.config.responseFormat = options.format;
    }
    if (options.includeMetadata !== undefined) {
      this.config.includeMetadata = options.includeMetadata;
    }
  }

  /**
   * Gets the current status of the webhook system including configuration,
   * queue status, and pending/failed webhook deliveries.
   *
   * @returns Object containing webhook status information
   * @returns {boolean} returns.configured - Whether a webhook URL is configured
   * @returns {WebhookConfig} returns.config - Current webhook configuration (URL, headers, retries, etc.)
   * @returns {Object} returns.queue - Webhook delivery queue status
   * @returns {number} returns.queue.pending - Number of webhooks pending delivery
   * @returns {boolean} returns.queue.processing - Whether webhooks are currently being processed
   * @returns {number} returns.queue.failed - Number of failed webhook deliveries in queue
   *
   * @example
   * ```typescript
   * const status = sdk.getWebhookStatus();
   * if (status.configured) {
   *   console.log(`Webhook URL: ${status.config.url}`);
   *   console.log(`Pending: ${status.queue.pending}`);
   *   console.log(`Failed: ${status.queue.failed}`);
   * } else {
   *   console.log('Webhook not configured');
   * }
   * ```
   */
  public getWebhookStatus() {
    return {
      configured: this.webhookHandler.isConfigured,
      config: this.webhookHandler.getConfig(),
      queue: this.webhookHandler.getQueueStatus()
    };
  }

  /**
   * Retries all failed webhook deliveries in the queue.
   * Resets attempt counters and immediately attempts to deliver all failed webhooks.
   * Useful for recovering from temporary network issues or webhook endpoint downtime.
   *
   * @example
   * ```typescript
   * const status = sdk.getWebhookStatus();
   * if (status.queue.failed > 0) {
   *   console.log(`Retrying ${status.queue.failed} failed webhooks...`);
   *   sdk.retryFailedWebhooks();
   * }
   * ```
   */
  public retryFailedWebhooks(): void {
    this.webhookHandler.retryFailed();
  }

  /**
   * Clears all pending and failed webhooks from the delivery queue.
   * Use this to discard webhooks that are no longer relevant or to recover from queue issues.
   * Warning: This will permanently discard all queued webhook events.
   *
   * @example
   * ```typescript
   * // Clear stale webhooks after reconfiguration
   * sdk.clearWebhookQueue();
   * sdk.configureWebhook('https://api.example.com/new-endpoint');
   * console.log('Webhook queue cleared and reconfigured');
   * ```
   */
  public clearWebhookQueue(): void {
    this.webhookHandler.clearQueue();
  }

  /**
   * Gets comprehensive health status of all SDK components.
   * Useful for monitoring, debugging, and operational dashboards.
   * Returns status of connection, webhooks, rate limiting, agents, and rooms.
   *
   * Overall health status calculation:
   * - healthy: All components operational
   * - degraded: Some components have issues but SDK is functional (e.g., webhook failures, circuit open)
   * - unhealthy: Critical components are not operational (e.g., disconnected, authentication failed)
   *
   * @returns Complete health status object with all component states
   * @returns {string} returns.status - Overall health: 'healthy', 'degraded', or 'unhealthy'
   * @returns {string} returns.timestamp - ISO timestamp of health check
   * @returns {Object} returns.connection - WebSocket connection health
   * @returns {Object} returns.webhook - Webhook delivery health including circuit breaker state
   * @returns {Object} returns.rateLimit - Rate limiter status (if configured)
   * @returns {Object} returns.agents - Agent registry health
   * @returns {Object} returns.rooms - Room management health
   *
   * @example
   * ```typescript
   * const health = sdk.getHealth();
   * console.log(`SDK Status: ${health.status}`);
   * console.log(`Connected: ${health.connection.status}`);
   * console.log(`Agents: ${health.agents.count}`);
   * console.log(`Webhook Circuit: ${health.webhook.circuitState}`);
   *
   * if (health.status !== 'healthy') {
   *   console.warn('SDK is degraded or unhealthy');
   *   if (!health.connection.authenticated) {
   *     console.log('Authentication issue');
   *   }
   *   if (health.webhook.failed > 0) {
   *     console.log(`${health.webhook.failed} failed webhooks`);
   *   }
   * }
   * ```
   */
  public getHealth(): HealthStatus {
    const connectionState = this.connection.getConnectionState();
    const webhookStatus = this.getWebhookStatus();
    const rateLimitStatus = this.wsClient.getRateLimiterStatus();

    // Determine connection status
    let connectionStatus: "connected" | "disconnected" | "reconnecting";
    if (connectionState.reconnecting) {
      connectionStatus = "reconnecting";
    } else if (connectionState.connected) {
      connectionStatus = "connected";
    } else {
      connectionStatus = "disconnected";
    }

    // Determine webhook health
    let webhookHealth: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (!webhookStatus.configured) {
      // Webhook not configured is not unhealthy
      webhookHealth = "healthy";
    } else if (webhookStatus.queue.circuitState === "OPEN") {
      webhookHealth = "unhealthy";
    } else if (webhookStatus.queue.failed > 0 || webhookStatus.queue.circuitState === "HALF_OPEN") {
      webhookHealth = "degraded";
    }

    // Determine overall health
    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (!connectionState.connected && !connectionState.reconnecting) {
      overallStatus = "unhealthy";
    } else if (!connectionState.authenticated && connectionState.reconnecting) {
      overallStatus = "degraded";
    } else if (webhookHealth === "unhealthy") {
      overallStatus = "degraded";
    } else if (webhookHealth === "degraded") {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      connection: {
        status: connectionStatus,
        authenticated: connectionState.authenticated,
        reconnectAttempts: connectionState.reconnectAttempts
      },
      webhook: {
        configured: webhookStatus.configured,
        status: webhookHealth,
        pending: webhookStatus.queue.pending,
        failed: webhookStatus.queue.failed,
        circuitState: webhookStatus.queue.circuitState
      },
      rateLimit: rateLimitStatus,
      agents: {
        count: this.agents.getAgents().length
      },
      rooms: {
        count: this.rooms.getRooms().length,
        subscribedRooms: this.rooms.getSubscribedRooms()
      }
    };
  }

  /**
   * Destroys the SDK instance and cleans up all resources.
   * Disconnects from the network, clears all managers, removes event listeners,
   * and marks the SDK as destroyed. After calling destroy(), the SDK instance
   * cannot be reused - create a new instance instead.
   * Emits 'destroy' event before completion.
   *
   * @example
   * ```typescript
   * // Clean up when shutting down
   * sdk.destroy();
   * console.log('SDK destroyed and resources cleaned up');
   *
   * // Create new instance if needed
   * const newSdk = new TeneoSDK(config);
   * ```
   */
  public destroy(): void {
    if (this.isDestroyed) return;

    this.logger.info("Destroying TeneoSDK");
    this.isDestroyed = true;

    // Destroy managers
    this.connection.destroy();
    this.rooms.destroy();
    this.agents.destroy();
    this.messages.destroy();

    // Destroy other components
    this.webhookHandler.destroy();
    this.removeAllListeners();

    this.emit("destroy");
  }

  /**
   * Set up event forwarding from managers
   */
  private setupEventForwarding(): void {
    // Forward connection events from ConnectionManager
    this.connection.on("connection:open", () => this.emit("connection:open"));
    this.connection.on("connection:close", (code, reason) =>
      this.emit("connection:close", code, reason)
    );
    this.connection.on("connection:error", (error) => this.emit("connection:error", error));
    this.connection.on("connection:reconnecting", (attempt) =>
      this.emit("connection:reconnecting", attempt)
    );
    this.connection.on("connection:reconnected", () => this.emit("connection:reconnected"));
    this.connection.on("connection:state", (state) => this.emit("connection:state", state));

    // Forward auth events from ConnectionManager
    this.connection.on("auth:challenge", (challenge) => this.emit("auth:challenge", challenge));
    this.connection.on("auth:success", (state) => {
      this.logger.debug("Received auth:success event in SDK", {
        authenticated: state?.authenticated,
        hasRooms: !!state?.roomObjects
      });

      // Update rooms from auth state
      if (state.roomObjects) {
        this.rooms.updateRoomsFromAuth(state.roomObjects);
      }

      this.emit("auth:success", state);
    });
    this.connection.on("auth:error", (error) => this.emit("auth:error", error));
    this.connection.on("auth:state", (state) => this.emit("auth:state", state));

    // Forward message events from MessageRouter
    this.messages.on("message:sent", (message) => this.emit("message:sent", message));
    this.messages.on("message:received", (message) => this.emit("message:received", message));
    this.messages.on("message:error", (error, message) =>
      this.emit("message:error", error, message)
    );

    // Forward agent events from MessageRouter
    this.messages.on("agent:selected", (data) => this.emit("agent:selected", data));
    this.messages.on("agent:response", (response) => this.emit("agent:response", response));

    // Forward coordinator events from MessageRouter
    this.messages.on("coordinator:processing", (request) =>
      this.emit("coordinator:processing", request)
    );
    this.messages.on("coordinator:selected", (agentId, reasoning) =>
      this.emit("coordinator:selected", agentId, reasoning)
    );
    this.messages.on("coordinator:error", (error) => this.emit("coordinator:error", error));

    // Handle agent list updates from WebSocketClient
    this.wsClient.on("agent:list", (agents) => {
      this.agents.updateAgents(agents);
    });

    // Forward room events from WebSocketClient (emitted by handlers)
    this.wsClient.on("room:subscribed", (data) => this.emit("room:subscribed", data));
    this.wsClient.on("room:unsubscribed", (data) => this.emit("room:unsubscribed", data));

    // Forward room events from RoomManager (if any direct emissions are added later)
    this.rooms.on("room:subscribed", (data) => this.emit("room:subscribed", data));
    this.rooms.on("room:unsubscribed", (data) => this.emit("room:unsubscribed", data));

    // Forward webhook events from WebhookHandler
    this.webhookHandler.on("webhook:sent", (payload, url) =>
      this.emit("webhook:sent", payload, url)
    );
    this.webhookHandler.on("webhook:success", (response, url) =>
      this.emit("webhook:success", response, url)
    );
    this.webhookHandler.on("webhook:error", (error, url) => this.emit("webhook:error", error, url));
    this.webhookHandler.on("webhook:retry", (attempt, url) =>
      this.emit("webhook:retry", attempt, url)
    );

    // Forward error events from ConnectionManager
    this.connection.on("error", (error) => {
      this.emit("error", error);
      // Fire and forget - don't block event emission
      this.webhookHandler
        .sendWebhook("error", error, { code: error.code })
        .catch((webhookError) => {
          this.logger.error("Failed to send webhook for error event", webhookError);
        });
    });

    // Forward lifecycle events from ConnectionManager
    this.connection.on("ready", () => this.emit("ready"));
    this.connection.on("disconnect", () => this.emit("disconnect"));
  }

  /**
   * Create default logger using pino
   */
  private createDefaultLogger(): Logger {
    return createPinoLogger(this.config.logLevel ?? "info", "TeneoSDK");
  }

  /**
   * Creates a new SDK configuration builder for fluent configuration.
   * The builder pattern provides a more intuitive way to configure the SDK
   * with method chaining and validation at each step.
   *
   * @returns A new SDKConfigBuilder instance for fluent configuration
   *
   * @example
   * ```typescript
   * const sdk = TeneoSDK.builder()
   *   .wsUrl('wss://teneo.example.com')
   *   .privateKey('0x...')
   *   .withAutoJoinRooms(['general'])
   *   .logLevel('debug')
   *   .webhookUrl('https://api.example.com/webhooks')
   *   .build();
   *
   * await sdk.connect();
   * ```
   */
  public static builder(): SDKConfigBuilder {
    return new SDKConfigBuilder();
  }
}
