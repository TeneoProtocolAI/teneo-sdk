/**
 * Main Teneo Protocol SDK class
 * Provides a unified interface for external platforms to interact with Teneo agents
 * Uses manager classes to follow Single Responsibility Principle
 */

import { EventEmitter } from "eventemitter3";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import {
  SDKConfig,
  PartialSDKConfig,
  PartialSDKConfigSchema,
  SDKConfigBuilder,
  Agent,
  RoomInfo,
  Logger,
  validateConfig,
  DEFAULT_CONFIG,
  ResponseFormatSchema,
  AgentRoomInfo,
  type HealthStatus
} from "./types";
import { SDKEvents, SDKError } from "./types/events";
import { CHAIN_ID_TO_NETWORK } from "./payments/networks";
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
  RoomManagementManager,
  AgentRoomManager,
  AgentRegistry,
  MessageRouter,
  SendMessageOptions,
  AgentCommand,
  QuoteResult,
  StreamingChunk,
  StreamingResponse,
  AdminManager,
  ListAllAgentsOptions,
  AllAgentsResult,
  ListAvailableAgentsOptions,
  PaginatedAgentsResult
} from "./managers";
import { createConsoleLogger } from "./utils/logger";
import { RoomIdSchema, AgentIdSchema, AgentCommandContentSchema } from "./types/validation";
import { SecurePrivateKey } from "./utils/secure-private-key";
import { setNetworkConfigUrl, initializeNetworks } from "./payments";
import { TIMEOUTS } from "./constants";

// Re-export types for external use
export type {
  SendMessageOptions,
  AgentCommand,
  QuoteResult,
  StreamingChunk,
  StreamingResponse,
  ListAllAgentsOptions,
  AllAgentsResult,
  ListAvailableAgentsOptions,
  PaginatedAgentsResult
};

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
  private secureKey?: SecurePrivateKey;

  // Core components
  private readonly wsClient: WebSocketClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly responseFormatter: ResponseFormatter;

  // Managers
  private readonly connection: ConnectionManager;
  private readonly rooms: RoomManager;
  private readonly roomManagement: RoomManagementManager;
  private readonly agentRoom: AgentRoomManager;
  private readonly agents: AgentRegistry;
  private readonly messages: MessageRouter;
  private readonly _admin: AdminManager;

  /**
   * Creates a new instance of the Teneo Protocol SDK.
   * Initializes all core components, managers, and validates the provided configuration.
   * The SDK handles WebSocket connections, authentication, message routing, and webhook delivery.
   *
   * @param config - Partial SDK configuration object (only wsUrl is required)
   * @param config.wsUrl - WebSocket URL to connect to (e.g., 'wss://teneo.example.com')
   * @param config.privateKey - Optional Ethereum private key for wallet-based authentication
   * @param config.walletAddress - Optional wallet address (derived from privateKey if not provided)
   * @param config.autoJoinPublicRooms - Optional array of public room IDs to subscribe to automatically on connection (private rooms are auto-available)
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
   *   autoJoinPublicRooms: ['public-room-1', 'public-room-2'], // Public rooms only
   *   webhookUrl: 'https://api.example.com/webhooks',
   *   logLevel: 'debug',
   *   responseFormat: 'both',
   *   reconnect: true,
   *   maxReconnectAttempts: 10
   * });
   *
   * // Using builder pattern (recommended for complex configs)
   * const config = TeneoSDK.builder()
   *   .withWebSocketUrl('wss://teneo.example.com')
   *   .withAuthentication('0x...')
   *   .withAutoJoinPublicRooms(['public-room-1', 'public-room-2'])
   *   .build();
   * const sdk = new TeneoSDK(config);
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

      // Store secure key for payment client
      if (config.privateKey) {
        if (typeof config.privateKey === "object" && "use" in config.privateKey) {
          this.secureKey = config.privateKey;
        } else {
          // Ensure the private key has 0x prefix before encrypting (matches websocket-client normalization)
          const pkStr = (config.privateKey as string).trim();
          const normalized = pkStr.startsWith("0x") ? pkStr : `0x${pkStr}`;
          if (normalized.length < 66) {
            throw new Error("Invalid private key: expected 32 bytes (64 hex characters)");
          }
          this.secureKey = new SecurePrivateKey(normalized);
        }
      }

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
      this.roomManagement = new RoomManagementManager(this.wsClient, this.logger);
      this.agentRoom = new AgentRoomManager(this.wsClient, this.logger, this.roomManagement);
      this.wsClient.setRoomManager(this.rooms); // Enable subscription tracking in handlers
      this.wsClient.setRoomManagementManager(this.roomManagement); // Enable room CRUD in handlers (v2.0.0)
      this.wsClient.setAgentRoomManager(this.agentRoom); // Enable agent-room operations in handlers (v2.0.0)
      this.agents = new AgentRegistry(this.logger);
      this.agents.setWebSocketClient(this.wsClient); // Enable getAgentDetails requests
      this._admin = new AdminManager(this.wsClient, this.logger);
      this.wsClient.setAdminManager(this._admin); // Enable admin handlers
      this.wsClient.setAgentRegistry(this.agents); // Enable agent details handler
      this.messages = new MessageRouter(
        this.wsClient,
        this.webhookHandler,
        this.responseFormatter,
        this.logger,
        {
          messageTimeout: this.config.messageTimeout,
          responseFormat: this.config.responseFormat,
          autoApproveQuotes: this.config.autoApproveQuotes,
          maxPricePerRequest: this.config.maxPricePerRequest,
          quoteTimeout: this.config.quoteTimeout,
          wsUrl: this.config.wsUrl,
          accessKey: this.config.accessKey,
          paymentNetwork: this.config.paymentNetwork,
          paymentAsset: this.config.paymentAsset,
          network: this.config.network, // Network name from withNetwork()
          autoSummon: this.config.autoSummon, // Auto-summon (v2.4.0)
          requestSource: this.config.requestSource
        }
      );
      this.messages.setAgentRoomManager(this.agentRoom); // Enable auto-summon (v2.4.0)

      // NOTE: Payment client is set up in connect() after networks are initialized

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
   * Establishes a connection to the Teneo Protocol via WebSocket.
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
   * console.log('Connected to Teneo Protocol');
   * ```
   */
  public async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    try {
      this.logger.info("Connecting to Teneo Protocol");

      // Initialize network configurations from backend before connecting
      setNetworkConfigUrl(this.config.wsUrl);
      await initializeNetworks();

      // Verify networks are fully loaded before payment setup
      const { NETWORKS } = await import("./payments/networks");
      if (Object.keys(NETWORKS).length === 0) {
        throw new SDKError(
          "Failed to initialize networks from backend",
          ErrorCode.CONFIG_ERROR,
          null,
          true
        );
      }

      // Set up payment client now that networks are initialized (v2.2.0)
      if (this.config.privateKey) {
        const secureKey =
          this.config.privateKey instanceof SecurePrivateKey
            ? this.config.privateKey
            : new SecurePrivateKey(this.config.privateKey);
        const walletAddress =
          this.config.walletAddress || this.deriveWalletAddress(this.config.privateKey);
        this.messages.setPaymentClient(secureKey, walletAddress);
      }

      await this.connection.connect();

      // Wait for the initial agent list the server sends right after auth_success.
      // Without this, getAgents() returns empty immediately after connect() because
      // the "agents" message hasn't been processed yet by the event loop.
      await this.waitForInitialAgentList();

      // Auto-join public rooms if configured
      if (this.config.autoJoinPublicRooms && this.config.autoJoinPublicRooms.length > 0) {
        for (const room of this.config.autoJoinPublicRooms) {
          await this.rooms.subscribeToPublicRoom(room);
        }
      }

      this.logger.info("Successfully connected to Teneo Protocol");
    } catch (error) {
      this.logger.error("Failed to connect to Teneo Protocol", error);
      throw error;
    }
  }

  /**
   * Waits for the initial agent list from the server after authentication.
   * The server sends an "agents" message right after auth_success, but it arrives
   * asynchronously. Without waiting, getAgents() returns empty right after connect().
   * Resolves immediately if agents are already loaded, or on timeout if the server
   * never sends the list (e.g. no agents exist).
   */
  private async waitForInitialAgentList(): Promise<void> {
    // Skip if not authenticated — unauthenticated connections don't get agent lists
    if (!this.connection.isAuthenticated) return;

    // Already have agents (e.g. reconnect where registry was preserved)
    if (this.agents.getAgents().length > 0) return;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.off("agent:list", onAgentList);
        this.logger.debug("Agent list wait timed out — continuing without initial list");
        resolve();
      }, TIMEOUTS.AGENT_LIST_WAIT);

      const onAgentList = () => {
        clearTimeout(timeout);
        this.off("agent:list", onAgentList);
        this.logger.debug("Initial agent list received");
        resolve();
      };

      this.once("agent:list", onAgentList);
    });
  }

  /**
   * Disconnects from the Teneo Protocol and cleans up all active connections.
   * Clears all timers, pending messages, and stops automatic reconnection attempts.
   * Emits 'disconnect' event after disconnection is complete.
   *
   * @example
   * ```typescript
   * sdk.disconnect();
   * console.log('Disconnected from Teneo Protocol');
   * ```
   */
  public disconnect(): void {
    this.logger.info("Disconnecting from Teneo Protocol");
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
   * @param command.network - Optional per-request network override (e.g., "base", "avalanche", or chain ID 8453)
   * @param waitForResponse - Whether to wait for the agent's response (default: false)
   * @returns Promise resolving to FormattedResponse if waitForResponse is true, void otherwise
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If agent or command are empty, or room is not configured
   *
   * @example
   * ```typescript
   * // Send command to specific agent
   * await sdk.sendDirectCommand({
   *   agent: 'weather-agent',
   *   command: 'Get forecast for New York',
   *   room: 'room-id'
   * });
   *
   * // With per-request network override
   * const response = await sdk.sendDirectCommand({
   *   agent: 'x-agent-enterprise-v2',
   *   command: 'user @elonmusk',
   *   room: 'room-id',
   *   network: 'base'  // Pay on Base for this request
   * }, true);
   * ```
   */
  public async sendDirectCommand(
    command: AgentCommand,
    waitForResponse: boolean = false
  ): Promise<FormattedResponse | void> {
    return this.messages.sendDirectCommand(command, waitForResponse);
  }

  /**
   * Sends a message and returns a streaming response with an async iterator.
   * Yields chunks as they arrive and provides assembled content when complete.
   *
   * @param content - The message content to send
   * @param options - Configuration for message sending (room is required)
   * @returns StreamingResponse with async iterator, assembledContent promise, and taskId
   */
  public sendMessageStreaming(content: string, options: SendMessageOptions): StreamingResponse {
    return this.messages.sendMessageStreaming(content, options);
  }

  /**
   * Requests a quote for a task from the coordinator.
   * The quote includes agent selection, pricing, and expiration.
   * Does NOT auto-approve - use confirmQuote() to execute.
   */
  public async requestQuote(
    content: string,
    room: string,
    networkOverride?: string | number
  ): Promise<QuoteResult> {
    return this.messages.requestQuote(content, room, networkOverride);
  }

  /**
   * Confirms a pending quote and executes the task with payment.
   * Attaches x402 payment header if payment client is configured.
   */
  public async confirmQuote(
    taskId: string,
    options?: { waitForResponse?: boolean; timeout?: number }
  ): Promise<FormattedResponse | void> {
    return this.messages.confirmQuote(taskId, options);
  }

  /**
   * Gets a pending quote by task ID.
   */
  public getPendingQuote(taskId: string): QuoteResult | undefined {
    return this.messages.getPendingQuote(taskId);
  }

  /**
   * Subscribes to a public room in the Teneo Protocol.
   * This is only needed for public rooms - private rooms are automatically subscribed.
   * Emits 'room:subscribed' event when successfully subscribed.
   *
   * @param roomId - The ID of the public room to subscribe to
   * @returns Promise that resolves when the room has been subscribed
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * // Subscribe to a public room
   * await sdk.subscribeToPublicRoom('public-room-id');
   * console.log('Subscribed to public room');
   *
   * // Note: Private rooms don't need subscription - you're always subscribed
   * ```
   */
  public async subscribeToPublicRoom(roomId: string): Promise<void> {
    return this.rooms.subscribeToPublicRoom(roomId);
  }

  /**
   * @deprecated Use subscribeToPublicRoom() instead. This method only affects public rooms.
   * Private rooms are automatically available after authentication without subscription.
   *
   * Subscribes to a public room in the Teneo Protocol.
   *
   * @param roomId - The ID of the public room to subscribe to
   * @returns Promise that resolves when the room has been subscribed
   */
  public async subscribeToRoom(roomId: string): Promise<void> {
    return this.subscribeToPublicRoom(roomId);
  }

  /**
   * Unsubscribes from a public room in the Teneo Protocol.
   * You will no longer receive messages from this public room.
   * Emits 'room:unsubscribed' event when successfully unsubscribed.
   *
   * Note: This only applies to public rooms. Private rooms cannot be unsubscribed from.
   *
   * @param roomId - The ID of the public room to unsubscribe from
   * @returns Promise that resolves when the room has been unsubscribed
   * @throws {SDKError} If not connected to the network (ErrorCode.NOT_CONNECTED)
   * @throws {ValidationError} If roomId is empty or invalid
   *
   * @example
   * ```typescript
   * await sdk.unsubscribeFromPublicRoom('public-room-id');
   * console.log('Unsubscribed from public room');
   * ```
   */
  public async unsubscribeFromPublicRoom(roomId: string): Promise<void> {
    return this.rooms.unsubscribeFromPublicRoom(roomId);
  }

  /**
   * @deprecated Use unsubscribeFromPublicRoom() instead. This method only affects public rooms.
   * Private rooms cannot be unsubscribed from.
   *
   * Unsubscribes from a public room in the Teneo Protocol.
   *
   * @param roomId - The ID of the public room to unsubscribe from
   * @returns Promise that resolves when the room has been unsubscribed
   */
  public async unsubscribeFromRoom(roomId: string): Promise<void> {
    return this.unsubscribeFromPublicRoom(roomId);
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
   * // Example output: Subscribed to 3 rooms: ['room-id-1', 'room-id-2', 'room-id-3']
   * ```
   */
  public getSubscribedRooms(): string[] {
    return this.rooms.getSubscribedRooms();
  }

  /**
   * Gets a list of all available agents in the Teneo Protocol.
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
   * Finds all available agents (network-wide) that have a specific capability using O(1) indexed lookup (PERF-3).
   * Much faster than filtering through all agents manually.
   * Uses capability index for constant-time lookups regardless of agent count.
   *
   * @param capability - The capability name to search for (case-insensitive)
   * @returns Read-only array of available agents with the specified capability
   * @throws {ValidationError} If capability name is invalid
   *
   * @example
   * ```typescript
   * // Find all weather-capable agents available on the network
   * const weatherAgents = sdk.findAvailableAgentsByCapability('weather-forecast');
   * console.log(`Found ${weatherAgents.length} weather agents`);
   *
   * weatherAgents.forEach(agent => {
   *   console.log(`- ${agent.name}: ${agent.description}`);
   * });
   * ```
   */
  public findAvailableAgentsByCapability(capability: string): ReadonlyArray<Agent> {
    return this.agents.findByCapability(capability);
  }

  /**
   * @deprecated Use findAvailableAgentsByCapability() instead. This searches all available agents network-wide.
   *
   * Finds all agents that have a specific capability.
   *
   * @param capability - The capability name to search for
   * @returns Read-only array of agents with the specified capability
   */
  public findAgentsByCapability(capability: string): ReadonlyArray<Agent> {
    return this.findAvailableAgentsByCapability(capability);
  }

  /**
   * Finds available agents (network-wide) by name using O(k) token-based search (PERF-3).
   * Supports partial matching - searches for tokens within agent names.
   * Tokenizes both the search query and agent names for flexible matching.
   *
   * @param name - Name or partial name to search for (case-insensitive)
   * @returns Read-only array of available agents matching the search
   * @throws {ValidationError} If name is invalid
   *
   * @example
   * ```typescript
   * // Find all available agents with "weather" in their name
   * const agents = sdk.findAvailableAgentsByName('weather');
   * // Matches: "Weather Agent", "Weather Forecast Bot", "Advanced Weather API", etc.
   *
   * console.log(`Found ${agents.length} agents matching 'weather'`);
   * ```
   */
  public findAvailableAgentsByName(name: string): ReadonlyArray<Agent> {
    return this.agents.findByName(name);
  }

  /**
   * @deprecated Use findAvailableAgentsByName() instead. This searches all available agents network-wide.
   *
   * Finds agents by name.
   *
   * @param name - Name or partial name to search for
   * @returns Read-only array of agents matching the search
   */
  public findAgentsByName(name: string): ReadonlyArray<Agent> {
    return this.findAvailableAgentsByName(name);
  }

  /**
   * Finds all available agents (network-wide) with a specific status using O(1) indexed lookup (PERF-3).
   * Uses status index for constant-time lookups regardless of agent count.
   *
   * @param status - Agent status: 'online' or 'offline' (case-insensitive)
   * @returns Read-only array of available agents with the specified status
   * @throws {ValidationError} If status is invalid
   *
   * @example
   * ```typescript
   * // Get all online agents available on the network
   * const onlineAgents = sdk.findAvailableAgentsByStatus('online');
   * console.log(`${onlineAgents.length} agents are currently online`);
   *
   * // Get offline agents
   * const offlineAgents = sdk.findAvailableAgentsByStatus('offline');
   * ```
   */
  public findAvailableAgentsByStatus(status: string): ReadonlyArray<Agent> {
    return this.agents.findByStatus(status);
  }

  /**
   * @deprecated Use findAvailableAgentsByStatus() instead. This searches all available agents network-wide.
   *
   * Finds all agents with a specific status.
   *
   * @param status - Agent status: 'online' or 'offline'
   * @returns Read-only array of agents with the specified status
   */
  public findAgentsByStatus(status: string): ReadonlyArray<Agent> {
    return this.findAvailableAgentsByStatus(status);
  }

  /**
   * Fetches detailed information about a specific agent from the server.
   * Makes a request to the server for full agent details including capabilities,
   * commands, pricing, and more.
   *
   * @param agentId - The unique identifier of the agent
   * @returns Promise that resolves with full agent details
   * @throws {SDKError} If not connected or request times out
   * @throws {ValidationError} If agentId is invalid
   *
   * @example
   * ```typescript
   * const details = await sdk.getAgentDetails('weather-agent-001');
   * console.log(`Agent: ${details.agent_name}`);
   * console.log(`Capabilities: ${details.capabilities?.length}`);
   * console.log(`Status: ${details.status}`);
   * ```
   */
  public async getAgentDetails(agentId: string): Promise<AgentRoomInfo> {
    return this.agents.getAgentDetails(agentId);
  }

  // ============================================================================
  // ADMIN API (Admin-Only Features)
  // ============================================================================

  /**
   * Gets the admin manager for admin-only features.
   * Returns undefined if the current user is not an admin.
   * Use this to access admin APIs like listing all agents, user counts, etc.
   *
   * @returns The AdminManager instance if user is admin, undefined otherwise
   *
   * @example
   * ```typescript
   * if (sdk.admin?.isAdmin) {
   *   // List all agents in the network
   *   const result = await sdk.admin.listAllAgents({ limit: 20 });
   *   console.log(`Found ${result.total} agents`);
   *
   *   result.agents.forEach(agent => {
   *     console.log(`${agent.agent_name}: status=${agent.review_status}, banned=${agent.is_banned}`);
   *   });
   *
   *   // Get user count
   *   const userCount = sdk.admin.getLastUserCount();
   *   console.log(`Online users: ${userCount?.count}`);
   *
   *   // Listen for user count updates
   *   sdk.admin.on('user_count', (data) => {
   *     console.log(`User count updated: ${data.count}`);
   *   });
   * }
   * ```
   */
  public get admin(): AdminManager | undefined {
    return this._admin.isAdmin ? this._admin : undefined;
  }

  /**
   * Lists all agents in the network (admin only, convenience method).
   * Returns paginated list of agents with full admin information.
   *
   * @param options - Pagination and filter options
   * @returns Promise that resolves with agents list
   * @throws {SDKError} If not connected or not an admin
   *
   * @example
   * ```typescript
   * const result = await sdk.listAllAgents({ limit: 50, filter: 'weather' });
   * console.log(`Found ${result.total} agents matching 'weather'`);
   * ```
   */
  public async listAllAgents(options: ListAllAgentsOptions = {}): Promise<AllAgentsResult> {
    return this._admin.listAllAgents(options);
  }

  /**
   * Gets a list of all available rooms in the Teneo Protocol.
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
  public getRooms(): ReadonlyArray<RoomInfo> {
    const managerRooms = this.rooms.getRooms();
    // Fall back to auth state if RoomManager hasn't been updated yet (race condition after connect)
    if (managerRooms.length === 0) {
      const authState = this.connection.getAuthState();
      if (authState.roomObjects && authState.roomObjects.length > 0) {
        return authState.roomObjects;
      }
    }
    return managerRooms;
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
   * const room = sdk.getRoom('room-id');
   * if (room) {
   *   console.log(`Found room: ${room.name}`);
   *   console.log(`Members: ${room.members?.length ?? 0}`);
   * } else {
   *   console.log('Room not found or no access');
   * }
   * ```
   */
  public getRoom(roomId: string): RoomInfo | undefined {
    const room = this.rooms.getRoom(roomId);
    // Fall back to auth state if RoomManager hasn't been updated yet (race condition after connect)
    if (!room) {
      const authState = this.connection.getAuthState();
      return authState.roomObjects?.find((r) => r.id === roomId);
    }
    return room;
  }

  // ============================================================================
  // ROOM MANAGEMENT API (v2.0.0)
  // ============================================================================

  /**
   * Creates a new private or public room.
   * Checks room limit before creating (for private rooms).
   * Emits 'room:created' event on success, 'room:create_error' on failure.
   *
   * @param options - Room creation options
   * @param options.name - Room name (1-100 characters)
   * @param options.description - Optional room description (max 500 characters)
   * @param options.isPublic - Whether room is public (default: false)
   * @returns Promise that resolves with created room info
   * @throws {SDKError} If not connected, over limit, or validation fails
   *
   * @example
   * ```typescript
   * const room = await sdk.createRoom({
   *   name: 'My Project Room',
   *   description: 'Collaboration space for my project',
   *   isPublic: false
   * });
   * console.log(`Created room: ${room.id}`);
   * ```
   */
  public async createRoom(options: {
    name: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<RoomInfo> {
    return this.roomManagement.createRoom(options);
  }

  /**
   * Updates an existing room's name and/or description.
   * User must own the room to update it.
   * Emits 'room:updated' event on success, 'room:update_error' on failure.
   *
   * @param roomId - ID of room to update
   * @param updates - Fields to update
   * @param updates.name - New room name (1-100 characters)
   * @param updates.description - New room description (max 500 characters)
   * @returns Promise that resolves with updated room info
   * @throws {SDKError} If not connected, not owner, or validation fails
   *
   * @example
   * ```typescript
   * const room = await sdk.updateRoom('room-123', {
   *   name: 'Updated Room Name',
   *   description: 'New description'
   * });
   * ```
   */
  public async updateRoom(
    roomId: string,
    updates: { name?: string; description?: string }
  ): Promise<RoomInfo> {
    return this.roomManagement.updateRoom(roomId, updates);
  }

  /**
   * Deletes a room permanently.
   * User must own the room to delete it.
   * Emits 'room:deleted' event on success, 'room:delete_error' on failure.
   *
   * @param roomId - ID of room to delete
   * @returns Promise that resolves when room is deleted
   * @throws {SDKError} If not connected or not owner
   *
   * @example
   * ```typescript
   * await sdk.deleteRoom('room-123');
   * console.log('Room deleted successfully');
   * ```
   */
  public async deleteRoom(roomId: string): Promise<void> {
    return this.roomManagement.deleteRoom(roomId);
  }

  /**
   * Gets all rooms owned by the current user.
   * Synchronous method that returns cached data from authentication.
   *
   * @returns Array of owned room info
   *
   * @example
   * ```typescript
   * const myRooms = sdk.getOwnedRooms();
   * console.log(`I own ${myRooms.length} rooms`);
   * myRooms.forEach(room => {
   *   console.log(`- ${room.name} (${room.id})`);
   * });
   * ```
   */
  public getOwnedRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return this.roomManagement.getOwnedRooms();
  }

  /**
   * Gets all rooms the user is a member of (but doesn't own).
   * Synchronous method that returns cached data from authentication.
   *
   * @returns Array of shared room info
   *
   * @example
   * ```typescript
   * const sharedRooms = sdk.getSharedRooms();
   * console.log(`I'm a member of ${sharedRooms.length} shared rooms`);
   * ```
   */
  public getSharedRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return this.roomManagement.getSharedRooms();
  }

  /**
   * Gets all rooms the user has access to (both owned and shared).
   * Convenience method that combines getOwnedRooms() and getSharedRooms().
   * Synchronous method that returns cached data from authentication.
   *
   * @returns Array of all room info (owned + shared)
   *
   * @example
   * ```typescript
   * const allRooms = sdk.getAllRooms();
   * console.log(`I have access to ${allRooms.length} total rooms`);
   *
   * // You can filter by ownership if needed
   * const myRooms = allRooms.filter(r => r.is_owner);
   * const sharedWithMe = allRooms.filter(r => !r.is_owner);
   * ```
   */
  public getAllRooms(): ReadonlyArray<Readonly<RoomInfo>> {
    return this.roomManagement.getAllRooms();
  }

  /**
   * Gets the maximum number of private rooms the user can create.
   * Based on user's subscription/plan.
   *
   * @returns Maximum private room limit
   *
   * @example
   * ```typescript
   * const limit = sdk.getRoomLimit();
   * const current = sdk.getOwnedRoomCount();
   * console.log(`Using ${current}/${limit} room slots`);
   * ```
   */
  public getRoomLimit(): number {
    return this.roomManagement.getRoomLimit();
  }

  /**
   * Gets the current count of owned private rooms.
   *
   * @returns Number of rooms user owns
   *
   * @example
   * ```typescript
   * const count = sdk.getOwnedRoomCount();
   * if (sdk.canCreateRoom()) {
   *   console.log(`Can create ${sdk.getRoomLimit() - count} more rooms`);
   * }
   * ```
   */
  public getOwnedRoomCount(): number {
    return this.roomManagement.getOwnedRoomCount();
  }

  /**
   * Checks if user can create another private room.
   * Compares current owned room count against limit.
   *
   * @returns True if under limit, false otherwise
   *
   * @example
   * ```typescript
   * if (sdk.canCreateRoom()) {
   *   await sdk.createRoom({ name: 'New Room' });
   * } else {
   *   console.log('Room limit reached! Upgrade your plan.');
   * }
   * ```
   */
  public canCreateRoom(): boolean {
    return this.roomManagement.canCreateRoom();
  }

  // ============================================================================
  // AGENT ROOM MANAGEMENT API (v2.0.0)
  // ============================================================================

  /**
   * Adds an agent to a room. Only room owners can add agents.
   * Emits 'agent_room:agent_added' on success, 'agent_room:add_error' on failure.
   *
   * @param roomId - ID of the room to add the agent to
   * @param agentId - ID of the agent to add
   * @returns Promise that resolves when agent is added
   * @throws {SDKError} If not connected, not owner, or agent already in room
   *
   * @example
   * ```typescript
   * await sdk.addAgentToRoom('room-123', 'weather-agent');
   * console.log('Agent added to room');
   * ```
   */
  public async addAgentToRoom(roomId: string, agentId: string): Promise<void> {
    return this.agentRoom.addAgentToRoom(roomId, agentId);
  }

  /**
   * Removes an agent from a room. Only room owners can remove agents.
   * Emits 'agent_room:agent_removed' on success, 'agent_room:remove_error' on failure.
   *
   * @param roomId - ID of the room to remove the agent from
   * @param agentId - ID of the agent to remove
   * @returns Promise that resolves when agent is removed
   * @throws {SDKError} If not connected, not owner, or agent not in room
   *
   * @example
   * ```typescript
   * await sdk.removeAgentFromRoom('room-123', 'weather-agent');
   * console.log('Agent removed from room');
   * ```
   */
  public async removeAgentFromRoom(roomId: string, agentId: string): Promise<void> {
    return this.agentRoom.removeAgentFromRoom(roomId, agentId);
  }

  /**
   * Lists all agents in a room.
   * Results are cached for 5 minutes for performance.
   * Emits 'agent_room:agents_listed' when list is received.
   *
   * @param roomId - ID of the room to list agents for
   * @param useCache - Whether to use cached data if available (default: true)
   * @returns Promise that resolves to array of agents in the room
   * @throws {SDKError} If not connected
   *
   * @example
   * ```typescript
   * const agents = await sdk.listRoomAgents('room-123');
   * console.log(`Room has ${agents.length} agents`);
   * agents.forEach(agent => {
   *   console.log(`- ${agent.agent_name} (${agent.status})`);
   * });
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async listRoomAgents(roomId: string, useCache: boolean = true): Promise<any[]> {
    return this.agentRoom.listRoomAgents(roomId, useCache);
  }

  /**
   * Lists all agents available to be added to a room.
   * Shows agents not currently in the room.
   * Results are cached for 5 minutes for performance.
   * Emits 'agent_room:available_agents_listed' when list is received.
   *
   * @param roomId - ID of the room to check available agents for
   * @param useCache - Whether to use cached data if available (default: true)
   * @returns Promise that resolves to array of available agents
   * @throws {SDKError} If not connected
   *
   * @example
   * ```typescript
   * // Simple usage (cached)
   * const available = await sdk.listAvailableAgents('room-123');
   * console.log(`${available.length} agents available to add`);
   *
   * // With pagination options
   * const result = await sdk.listAvailableAgents('room-123', {
   *   limit: 20,
   *   offset: 0,
   *   sortBy: 'a-z'
   * });
   * console.log(`${result.total} total agents, showing ${result.agents.length}`);
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async listAvailableAgents(roomId: string, useCache?: boolean): Promise<any[]>;
  public async listAvailableAgents(
    roomId: string | undefined,
    options: ListAvailableAgentsOptions
  ): Promise<PaginatedAgentsResult>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async listAvailableAgents(
    roomId: string | undefined,
    useCacheOrOptions?: boolean | ListAvailableAgentsOptions
  ): Promise<any[] | PaginatedAgentsResult> {
    return this.agentRoom.listAvailableAgents(roomId, useCacheOrOptions as any);
  }

  /**
   * Gets agents in a room from cache (synchronous).
   * Returns undefined if not cached. Use listRoomAgents() to fetch.
   *
   * @param roomId - ID of the room
   * @returns Array of agents if cached, undefined otherwise
   *
   * @example
   * ```typescript
   * const agents = sdk.getCachedRoomAgents('room-123');
   * if (agents) {
   *   console.log(`${agents.length} agents (cached)`);
   * } else {
   *   await sdk.listRoomAgents('room-123'); // Fetch from server
   * }
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getCachedRoomAgents(roomId: string): any[] | undefined {
    return this.agentRoom.getCachedRoomAgents(roomId);
  }

  /**
   * @deprecated Use getCachedRoomAgents() instead. This method returns cached data only.
   * Use listRoomAgents() to fetch fresh data from server.
   *
   * Gets agents in a room from cache (synchronous).
   *
   * @param roomId - ID of the room
   * @returns Array of agents if cached, undefined otherwise
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getRoomAgents(roomId: string): any[] | undefined {
    return this.getCachedRoomAgents(roomId);
  }

  /**
   * Gets available agents for a room from cache (synchronous).
   * Returns undefined if not cached. Use listAvailableAgents() to fetch.
   *
   * @param roomId - ID of the room
   * @returns Array of available agents if cached, undefined otherwise
   *
   * @example
   * ```typescript
   * const available = sdk.getCachedAvailableAgents('room-123');
   * if (available) {
   *   console.log(`${available.length} agents available (cached)`);
   * }
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getCachedAvailableAgents(roomId: string): any[] | undefined {
    return this.agentRoom.getCachedAvailableAgents(roomId);
  }

  /**
   * @deprecated Use getCachedAvailableAgents() instead. This method returns cached data only.
   * Use listAvailableAgents() to fetch fresh data from server.
   *
   * Gets available agents for a room from cache (synchronous).
   *
   * @param roomId - ID of the room
   * @returns Array of available agents if cached, undefined otherwise
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getAvailableAgents(roomId: string): any[] | undefined {
    return this.getCachedAvailableAgents(roomId);
  }

  /**
   * Checks if an agent is in a room (synchronous, from cache).
   * Returns undefined if room data not cached.
   *
   * @param roomId - ID of the room
   * @param agentId - ID of the agent
   * @returns True if agent is in room, false if not, undefined if not cached
   *
   * @example
   * ```typescript
   * const inRoom = sdk.checkAgentInRoom('room-123', 'weather-agent');
   * if (inRoom === true) {
   *   console.log('Agent is in room');
   * } else if (inRoom === false) {
   *   console.log('Agent is not in room');
   * } else {
   *   console.log('Room data not cached - need to fetch');
   * }
   * ```
   */
  public checkAgentInRoom(roomId: string, agentId: string): boolean | undefined {
    return this.agentRoom.checkAgentInRoom(roomId, agentId);
  }

  /**
   * @deprecated Use checkAgentInRoom() instead. The 'is*' naming convention implies boolean-only,
   * but this method returns boolean | undefined to indicate cache validity.
   *
   * Checks if an agent is in a room (synchronous, from cache).
   *
   * @param roomId - ID of the room
   * @param agentId - ID of the agent
   * @returns True if agent is in room, false if not, undefined if not cached
   */
  public isAgentInRoom(roomId: string, agentId: string): boolean | undefined {
    return this.checkAgentInRoom(roomId, agentId);
  }

  /**
   * Gets the count of agents in a room (synchronous, from cache).
   * Returns undefined if room data not cached.
   *
   * @param roomId - ID of the room
   * @returns Number of agents in room, or undefined if not cached
   *
   * @example
   * ```typescript
   * const count = sdk.getCachedRoomAgentCount('room-123');
   * if (count !== undefined) {
   *   console.log(`Room has ${count} agents`);
   * }
   * ```
   */
  public getCachedRoomAgentCount(roomId: string): number | undefined {
    return this.agentRoom.getCachedRoomAgentCount(roomId);
  }

  /**
   * @deprecated Use getCachedRoomAgentCount() instead. This method returns cached data only.
   * Use listRoomAgents() to fetch fresh data from server.
   *
   * Gets the count of agents in a room (synchronous, from cache).
   *
   * @param roomId - ID of the room
   * @returns Number of agents in room, or undefined if not cached
   */
  public getRoomAgentCount(roomId: string): number | undefined {
    return this.getCachedRoomAgentCount(roomId);
  }

  /**
   * Invalidates the agent-room cache for a specific room.
   * Forces the next listRoomAgents() or listAvailableAgents() call to fetch fresh data.
   * Useful after bulk operations or when you know the cache is stale.
   *
   * @param roomId - ID of the room to invalidate cache for
   *
   * @example
   * ```typescript
   * // After adding/removing agents
   * await sdk.addAgentToRoom('room-123', 'agent-456');
   * sdk.invalidateAgentRoomCache('room-123');
   * const freshAgents = await sdk.listRoomAgents('room-123');
   * ```
   */
  public invalidateAgentRoomCache(roomId: string): void {
    this.agentRoom.invalidateCache(roomId);
  }

  /**
   * Updates user preferences on the server.
   * Server-side enforcement of max price per request - prevents quotes/payments exceeding the limit.
   *
   * @param preferences - User preferences to update
   * @param preferences.maxPricePerRequest - Max price per request in USDC (e.g., 0.01 = $0.01), or null to remove limit
   * @returns Promise that resolves when preferences are updated
   * @throws {SDKError} If update fails or times out
   *
   * @example
   * ```typescript
   * // Set a spending limit of $0.05 per request
   * await sdk.setUserPreferences({ maxPricePerRequest: 0.05 });
   *
   * // Remove the spending limit
   * await sdk.setUserPreferences({ maxPricePerRequest: null });
   * ```
   */
  public async setUserPreferences(preferences: {
    maxPricePerRequest?: number | null;
  }): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    const message = {
      type: "set_user_preferences" as const,
      data: {
        max_price_per_request: preferences.maxPricePerRequest
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SDKError("Set user preferences request timed out", ErrorCode.TIMEOUT_ERROR));
      }, 30000);

      const handleResponse = (msg: {
        type: string;
        data?: { success?: boolean; message?: string; max_price_per_request?: number | null };
      }) => {
        if (msg.type === "user_preferences_updated") {
          cleanup();
          if (msg.data?.success) {
            this.emit("preferences:updated", {
              maxPricePerRequest: msg.data.max_price_per_request
            });
            resolve();
          } else {
            reject(
              new SDKError(
                msg.data?.message || "Failed to update preferences",
                ErrorCode.MESSAGE_ERROR
              )
            );
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.wsClient.off("message:received", handleResponse);
      };

      this.wsClient.on("message:received", handleResponse);
      this.wsClient.sendMessage(message).catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  /**
   * Sends the result of an on-chain transaction back to the server.
   * Used in response to a "wallet:tx_requested" event after the user
   * has confirmed, rejected, or encountered a failure with the transaction.
   *
   * The txHash is automatically formatted with the network name (e.g., `0xabc...|base`)
   * when a chainId is provided, matching the format the UI uses.
   *
   * For terminal statuses ("confirmed", "failed", "rejected"), this method
   * automatically emits a "wallet:tx_completed" event so consumers can track
   * transaction lifecycle without manually emitting it.
   *
   * @param taskId - The task ID from the wallet:tx_requested event
   * @param status - Transaction result: "broadcasted" (tx sent, hash available), "confirmed" (on-chain receipt), "rejected" (user declined), or "failed" (error)
   * @param txHash - The on-chain transaction hash (required for "broadcasted" and "confirmed" status)
   * @param error - Error message (optional, for "failed" status)
   * @param room - The room ID from the wallet:tx_requested event (required for routing)
   * @param chainId - The chain ID from data.tx.chainId (used to format txHash with network name)
   * @fires wallet:tx_completed When status is "confirmed", "failed", or "rejected"
   * @throws {SDKError} If the SDK has been destroyed or not connected
   *
   * @example
   * ```typescript
   * sdk.on("wallet:tx_requested", async (data) => {
   *   try {
   *     const txHash = await wallet.sendTransaction(data.tx);
   *     // Notify agent that tx was broadcast (hash available, not yet confirmed)
   *     await sdk.sendTxResult(data.taskId, "broadcasted", txHash, undefined, data.room, data.tx.chainId);
   *     // Wait for on-chain confirmation
   *     await waitForReceipt(txHash);
   *     await sdk.sendTxResult(data.taskId, "confirmed", txHash, undefined, data.room, data.tx.chainId);
   *   } catch (err) {
   *     await sdk.sendTxResult(data.taskId, "failed", undefined, err.message, data.room, data.tx.chainId);
   *   }
   * });
   * ```
   */
  public async sendTxResult(
    taskId: string,
    status: "broadcasted" | "confirmed" | "rejected" | "failed",
    txHash?: string,
    error?: string,
    room?: string,
    chainId?: number
  ): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    // Format txHash with network name (e.g., "0xabc...|base") to match UI format
    let formattedTxHash = txHash;
    if (txHash && chainId) {
      const networkName = CHAIN_ID_TO_NETWORK[chainId];
      if (networkName) {
        formattedTxHash = `${txHash}|${networkName}`;
      }
    }

    const message = {
      type: "tx_result" as const,
      ...(room && { room }),
      timestamp: new Date().toISOString(),
      data: {
        task_id: taskId,
        status,
        ...(formattedTxHash && { tx_hash: formattedTxHash }),
        ...(error && { error })
      }
    };

    await this.wsClient.sendMessage(message);

    // Emit wallet:tx_completed for terminal statuses so consumers can
    // track completion without manually emitting this event themselves
    if (status === "confirmed" || status === "failed" || status === "rejected") {
      this.emit("wallet:tx_completed", {
        taskId,
        status,
        ...(formattedTxHash && { txHash: formattedTxHash }),
        ...(error && { error }),
        ...(room && { room }),
        ...(chainId && { chainId })
      });
    }
  }

  /**
   * Sets the API key preference for the current user.
   * Controls whether custom API keys are used for agent interactions.
   *
   * @param useCustomKeys - Whether to use custom API keys
   * @throws {SDKError} If the SDK has been destroyed or not connected
   *
   * @example
   * ```typescript
   * // Enable custom API keys
   * await sdk.setApiKeyPreference(true);
   *
   * // Disable custom API keys
   * await sdk.setApiKeyPreference(false);
   * ```
   */
  public async setApiKeyPreference(useCustomKeys: boolean): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const message = {
      type: "set_api_key_preference" as const,
      data: {
        use_custom_keys: useCustomKeys
      }
    };

    await this.wsClient.sendMessage(message);
  }

  /**
   * Send a room ping to get live user count
   * Server responds with room_pong message containing current live user count
   *
   * @param roomId - The room ID to ping
   * @throws {SDKError} If not connected or SDK is destroyed
   *
   * @example
   * ```typescript
   * // Ping a room to get live user count
   * await sdk.sendRoomPing("my-room");
   *
   * // Listen for the response
   * sdk.on("room:pong", (data) => {
   *   console.log(`Room ${data.roomId} has ${data.liveCount} live users`);
   * });
   * ```
   */
  public async sendRoomPing(roomId: string): Promise<void> {
    if (this.isDestroyed) {
      throw new SDKError("SDK has been destroyed", ErrorCode.SDK_DESTROYED, null, false);
    }

    if (!this.wsClient.isConnected) {
      throw new SDKError("Not connected to Teneo Protocol", ErrorCode.NOT_CONNECTED);
    }

    const message = {
      type: "room_ping" as const,
      room_id: roomId
    };

    await this.wsClient.sendMessage(message);
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
   * @returns True if connected to the Teneo Protocol, false otherwise
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
   * @returns True if authenticated with the Teneo Protocol, false otherwise
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
   * Gets the current message deduplication cache status (CB-4).
   * Returns statistics about the deduplication cache including size, TTL, and capacity.
   * Useful for monitoring deduplication behavior and cache health.
   * Returns undefined if deduplication is not configured or disabled.
   *
   * @returns Deduplication cache status object, or undefined if not configured
   * @returns {number} returns.cacheSize - Number of message IDs currently cached
   * @returns {number} returns.ttl - Time-to-live for cache entries in milliseconds
   * @returns {number} returns.maxSize - Maximum cache size capacity
   *
   * @example
   * ```typescript
   * const status = sdk.getDeduplicationStatus();
   * if (status) {
   *   console.log(`Cache: ${status.cacheSize}/${status.maxSize}`);
   *   console.log(`Utilization: ${(status.cacheSize / status.maxSize * 100).toFixed(1)}%`);
   *   console.log(`TTL: ${status.ttl}ms`);
   * } else {
   *   console.log('Deduplication not enabled');
   * }
   * ```
   */
  public getDeduplicationStatus():
    | {
        cacheSize: number;
        ttl: number;
        maxSize: number;
      }
    | undefined {
    return this.wsClient.getDeduplicationStatus();
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
    this._admin.destroy();

    // Destroy other components
    this.webhookHandler.destroy();

    this.emit("destroy");
    this.removeAllListeners();
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
        hasRooms: !!state?.roomObjects,
        ownedRooms: state?.privateRoomIds?.length || 0,
        sharedRooms: state?.sharedRoomIds?.length || 0
      });

      // Update rooms from auth state
      if (state.roomObjects) {
        this.rooms.updateRoomsFromAuth(state.roomObjects);
      }

      // Ensure RoomManagementManager is synced with auth state
      if (state.roomObjects && state.roomObjects.length > 0) {
        const ownedRooms = state.roomObjects.filter((r) => r.is_owner);
        const sharedRooms = state.roomObjects.filter((r) => !r.is_owner);
        this.roomManagement.setOwnedRooms(ownedRooms);
        this.roomManagement.setSharedRooms(sharedRooms);

        if (state.maxPrivateRooms) {
          this.roomManagement.setRoomLimit(state.maxPrivateRooms);
        }
      }

      // Set up payment client for x402 payments
      if (this.secureKey && state.walletAddress) {
        this.messages.setPaymentClient(this.secureKey, state.walletAddress);
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
    this.messages.on("agent:chunk", (data) => this.emit("agent:chunk", data));
    this.messages.on("agent:stream_end", (data) => this.emit("agent:stream_end", data));

    // Forward quote and payment events from MessageRouter (v2.2.0)
    this.messages.on("quote:received", (quote) => this.emit("quote:received", quote));
    this.messages.on("payment:blocked", (data) => this.emit("payment:blocked", data));
    this.messages.on("payment:attached", (data) => this.emit("payment:attached", data));
    this.messages.on("payment:error", (error) => this.emit("payment:error", error));

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
      this.emit("agent:list", agents);
    });

    // Forward task confirmed events from WebSocketClient (emitted by handlers)
    this.wsClient.on("task:confirmed", (data) => {
      this.emit("task:confirmed", data);
    });

    // Forward agent error events from WebSocketClient (emitted by handlers)
    this.wsClient.on("agent:error", (data) => {
      this.emit("agent:error", data);
    });

    // Forward wallet transaction events from WebSocketClient (emitted by handlers)
    this.wsClient.on("wallet:tx_requested", (data) => {
      this.emit("wallet:tx_requested", data);
    });

    // Forward room pong events from WebSocketClient (emitted by pong handler)
    this.wsClient.on("room:pong", (data) => {
      this.emit("room:pong", data);
    });

    // Forward success events from WebSocketClient (emitted by handlers)
    this.wsClient.on("success", (message) => {
      this.emit("success", message);
    });

    // Forward message deduplication events from WebSocketClient
    this.wsClient.on("message:duplicate", (message) => this.emit("message:duplicate", message));

    // Forward signature verification events from WebSocketClient
    this.wsClient.on("signature:verified", (messageType, address) =>
      this.emit("signature:verified", messageType, address)
    );
    this.wsClient.on("signature:failed", (messageType, reason, address) =>
      this.emit("signature:failed", messageType, reason, address)
    );
    this.wsClient.on("signature:missing", (messageType, required) =>
      this.emit("signature:missing", messageType, required)
    );

    // Forward room events from WebSocketClient (emitted by room subscription handlers)
    this.wsClient.on("room:subscribed", (data) => this.emit("room:subscribed", data));
    this.wsClient.on("room:unsubscribed", (data) => this.emit("room:unsubscribed", data));

    // Forward room management events from WebSocketClient (emitted by handlers) (v2.0.0)
    // These events are emitted by message handlers, so we listen on wsClient
    // We forward to RoomManagementManager first (for promise resolution), then emit on SDK
    this.wsClient.on("room:created", (room) => {
      // Update RoomManagementManager cache
      this.roomManagement.upsertRoom(room);
      // Emit on RoomManagementManager for promise resolution (see createRoom method)
      this.roomManagement.emit("room:created", room);
      // Emit on SDK for external listeners
      this.emit("room:created", room);
    });
    this.wsClient.on("room:updated", (room) => {
      // Update RoomManagementManager cache
      this.roomManagement.upsertRoom(room);
      // Emit on RoomManagementManager for promise resolution (see updateRoom method)
      this.roomManagement.emit("room:updated", room);
      // Emit on SDK for external listeners
      this.emit("room:updated", room);
    });
    this.wsClient.on("room:deleted", (roomId) => {
      // Remove from RoomManagementManager cache
      this.roomManagement.removeRoom(roomId);
      // Emit on RoomManagementManager for promise resolution (see deleteRoom method)
      this.roomManagement.emit("room:deleted", roomId);
      // Emit on SDK for external listeners
      this.emit("room:deleted", roomId);
    });
    this.wsClient.on("room:list", (rooms) => {
      // Emit on RoomManager for promise resolution (see listRooms method)
      this.rooms.emit("room:list", rooms);
      // Emit on SDK for external listeners
      this.emit("room:list", rooms);
    });
    this.wsClient.on("room:create_error", (error) => {
      // Emit on RoomManagementManager for promise rejection
      this.roomManagement.emit("room:create_error", error);
      // Emit on SDK for external listeners
      this.emit("room:create_error", error);
    });
    this.wsClient.on("room:update_error", (error, roomId) => {
      // Emit on RoomManagementManager for promise rejection
      this.roomManagement.emit("room:update_error", error, roomId);
      // Emit on SDK for external listeners
      this.emit("room:update_error", error, roomId);
    });
    this.wsClient.on("room:delete_error", (error, roomId) => {
      // Emit on RoomManagementManager for promise rejection
      this.roomManagement.emit("room:delete_error", error, roomId);
      // Emit on SDK for external listeners
      this.emit("room:delete_error", error, roomId);
    });

    // Forward agent room management events from WebSocketClient (emitted by handlers) (v2.0.0)
    // These events are emitted by message handlers, so we listen on wsClient
    // We forward to AgentRoomManager first (for promise resolution), then emit on SDK
    this.wsClient.on("agent_room:agent_added", (roomId, agentId) => {
      // Emit on AgentRoomManager for promise resolution (see addAgentToRoom method)
      this.agentRoom.emit("agent_room:agent_added", roomId, agentId);
      // Emit on SDK for external listeners
      this.emit("agent_room:agent_added", roomId, agentId);
    });
    this.wsClient.on("agent_room:agent_removed", (roomId, agentId) => {
      // Emit on AgentRoomManager for promise resolution (see removeAgentFromRoom method)
      this.agentRoom.emit("agent_room:agent_removed", roomId, agentId);
      // Emit on SDK for external listeners
      this.emit("agent_room:agent_removed", roomId, agentId);
    });
    this.wsClient.on("agent_room:agents_listed", (roomId, agents) => {
      // Emit on AgentRoomManager for promise resolution
      this.agentRoom.emit("agent_room:agents_listed", roomId, agents);
      // Emit on SDK for external listeners
      this.emit("agent_room:agents_listed", roomId, agents);
    });
    this.wsClient.on("agent_room:available_agents_listed", (agents, paginationMeta) => {
      // Emit on AgentRoomManager for promise resolution
      this.agentRoom.emit("agent_room:available_agents_listed", agents, paginationMeta);
      // Emit on SDK for external listeners
      this.emit("agent_room:available_agents_listed", agents, paginationMeta);
    });
    this.wsClient.on("agent_room:status_update", (data) => {
      // Emit on SDK for external listeners
      this.emit("agent_room:status_update", data);
    });
    this.wsClient.on("agent_room:add_error", (error, roomId) => {
      // Emit on AgentRoomManager for promise rejection
      this.agentRoom.emit("agent_room:add_error", error, roomId);
      // Emit on SDK for external listeners
      this.emit("agent_room:add_error", error, roomId);
    });
    this.wsClient.on("agent_room:remove_error", (error, roomId) => {
      // Emit on AgentRoomManager for promise rejection
      this.agentRoom.emit("agent_room:remove_error", error, roomId);
      // Emit on SDK for external listeners
      this.emit("agent_room:remove_error", error, roomId);
    });
    this.wsClient.on("agent_room:list_error", (error, roomId) => {
      // Emit on AgentRoomManager for promise rejection
      this.agentRoom.emit("agent_room:list_error", error, roomId);
      // Emit on SDK for external listeners
      this.emit("agent_room:list_error", error, roomId);
    });
    this.wsClient.on("agent_room:list_available_error", (error) => {
      // Emit on AgentRoomManager for promise rejection
      this.agentRoom.emit("agent_room:list_available_error", error);
      // Emit on SDK for external listeners
      this.emit("agent_room:list_available_error", error);
    });

    // Forward autosummon lifecycle events (v2.5.0)
    this.wsClient.on("autosummon:start", (agentName, roomId) => {
      this.emit("autosummon:start", agentName, roomId);
    });
    this.wsClient.on("autosummon:success", (agentName, agentId, roomId) => {
      this.emit("autosummon:success", agentName, agentId, roomId);
    });
    this.wsClient.on("autosummon:failed", (agentName, roomId, reason) => {
      this.emit("autosummon:failed", agentName, roomId, reason);
    });

    // Forward admin events from AdminManager
    this._admin.on("user_count", (data) => {
      this.emit("admin:user_count", data);
    });
    this._admin.on("status_changed", (isAdmin) => {
      this.emit("admin:status_changed", isAdmin);
    });

    // Forward rate limit notifications from WebSocketClient (emitted by handlers)
    this.wsClient.on("rate_limit", (notification) => {
      this.emit("rate_limit", notification);
    });

    // Forward user authenticated events from WebSocketClient (emitted by handlers)
    this.wsClient.on("user:authenticated", (data) => {
      this.emit("user:authenticated", data);
    });

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
      // Defensive check: ensure error has toJSON method (SDKError instances do)
      const errorPayload =
        typeof error.toJSON === "function"
          ? error.toJSON()
          : { message: error.message, name: error.name, code: error.code };
      this.webhookHandler
        .sendWebhook("error", errorPayload, { code: error.code })
        .catch((webhookError) => {
          this.logger.error("Failed to send webhook for error event", webhookError);
        });
    });

    // Forward lifecycle events from ConnectionManager
    this.connection.on("ready", () => this.emit("ready"));
    this.connection.on("disconnect", () => this.emit("disconnect"));
  }

  /**
   * Create default console-based logger
   */
  private createDefaultLogger(): Logger {
    return createConsoleLogger(this.config.logLevel ?? "info", "TeneoSDK");
  }

  /**
   * Derive wallet address from private key
   */
  private deriveWalletAddress(privateKey: string | SecurePrivateKey): string {
    if (privateKey instanceof SecurePrivateKey) {
      return privateKey.use((key) => privateKeyToAccount(key as `0x${string}`).address);
    }
    return privateKeyToAccount(privateKey as `0x${string}`).address;
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
   * const config = TeneoSDK.builder()
   *   .withWebSocketUrl('wss://teneo.example.com')
   *   .withAuthentication('0x...')
   *   .withAutoJoinPublicRooms(['public-room-1', 'public-room-2'])
   *   .withLogging('debug')
   *   .withWebhook('https://api.example.com/webhooks')
   *   .build();
   * const sdk = new TeneoSDK(config);
   *
   * await sdk.connect();
   * ```
   */
  public static builder(): SDKConfigBuilder {
    return new SDKConfigBuilder();
  }
}
