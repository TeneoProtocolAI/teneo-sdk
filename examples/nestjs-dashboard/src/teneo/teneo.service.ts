import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TeneoSDK, SDKConfigBuilder, SecurePrivateKey } from "../../../../dist/index.js";

@Injectable()
export class TeneoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeneoService.name);
  private sdk: TeneoSDK;
  private messageCounter = 0;
  private errorCounter = 0;
  private recentEvents: any[] = [];
  private recentMessages: any[] = [];
  private recentWebhooks: any[] = [];
  private sseClients: Set<any> = new Set();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeSDK();
  }

  async onModuleDestroy() {
    if (this.sdk) {
      this.logger.log("Disconnecting SDK...");
      this.sdk.disconnect();
      this.sdk.destroy();
    }
  }

  private async initializeSDK() {
    this.logger.log("Initializing Teneo SDK...");

    const wsUrl = this.configService.get<string>("WS_URL");
    const privateKey = this.configService.get<string>("PRIVATE_KEY");
    const walletAddress = this.configService.get<string>("WALLET_ADDRESS") || undefined;
    const enableSigVerification =
      this.configService.get<string>("ENABLE_SIGNATURE_VERIFICATION") === "true";
    const trustedAddresses =
      this.configService.get<string>("TRUSTED_ADDRESSES")?.split(",").filter(Boolean) || [];

    if (!wsUrl || !privateKey) {
      throw new Error("Missing required environment variables: WS_URL, PRIVATE_KEY");
    }

    try {
      const secureKey = new SecurePrivateKey(privateKey);
      this.logger.log("Private key encrypted in memory");

      const port = this.configService.get<string>("PORT") || "3002";
      const webhookUrl = `http://localhost:${port}/api/webhook`;

      const config = new SDKConfigBuilder()
        .withWebSocketUrl(wsUrl)
        .withAuthentication(secureKey, walletAddress)
        .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
        .withReconnectionStrategy({
          type: "exponential",
          baseDelay: 3000,
          maxDelay: 120000,
          maxAttempts: 15,
          jitter: true,
          backoffMultiplier: 2.5
        })
        .withWebhook(webhookUrl, {
          "X-API-Key": "nestjs-dashboard-secret",
          "Content-Type": "application/json"
        })
        .withResponseFormat({ format: "both", includeMetadata: true })
        .withLogging("info")
        .withCache(true, 300000, 100)
        .withMessageDeduplication(true, 120000, 50000)
        .withSignatureVerification({
          enabled: enableSigVerification,
          trustedAddresses,
          requireFor: ["task_response", "agent_selected"],
          strictMode: false
        })
        .build();

      // Allow localhost webhooks for development
      config.allowInsecureWebhooks = true;

      this.sdk = new TeneoSDK(config);
      this.logger.log(`Webhook configured for ${webhookUrl}`);

      this.setupEventListeners();

      this.logger.log("Connecting to Teneo Protocol...");
      await this.sdk.connect();
      this.logger.log("Successfully connected and authenticated!");
    } catch (error) {
      this.logger.error("Failed to initialize SDK:", error);
      throw error;
    }
  }

  private setupEventListeners() {
    this.sdk.on("connection:open", () => {
      this.logger.log("WebSocket connected");
      this.addEvent("connection:open", { message: "Connected to WebSocket" });
      this.broadcastSSE({ type: "connection", status: "connected" });
    });

    this.sdk.on("connection:close", (code, reason) => {
      this.logger.warn(`WebSocket disconnected: ${code} - ${reason}`);
      this.addEvent("connection:close", { code, reason });
      this.broadcastSSE({ type: "connection", status: "disconnected", code, reason });
    });

    this.sdk.on("connection:reconnecting", (attempt) => {
      this.logger.log(`Reconnecting... attempt ${attempt}`);
      this.addEvent("connection:reconnecting", { attempt });
      this.broadcastSSE({ type: "connection", status: "reconnecting", attempt });
    });

    this.sdk.on("connection:reconnected", () => {
      this.logger.log("Reconnected successfully");
      this.addEvent("connection:reconnected", { message: "Reconnected successfully" });
      this.broadcastSSE({ type: "connection", status: "reconnected" });
    });

    this.sdk.on("auth:success", (state) => {
      this.logger.log(`Authenticated as ${state.walletAddress}`);
      this.addEvent("auth:success", { walletAddress: state.walletAddress });
      this.broadcastSSE({ type: "auth", status: "success", state });
    });

    this.sdk.on("auth:error", (error) => {
      this.logger.error("Authentication error:", error);
      this.errorCounter++;
      this.addEvent("auth:error", { error });
    });

    this.sdk.on("agent:selected", (data) => {
      this.addEvent("agent:selected", { agentName: data.agentName, reasoning: data.reasoning });
      this.broadcastSSE({ type: "agent:selected", data });
    });

    this.sdk.on("agent:response", (response) => {
      this.logger.log(`Agent response from ${response.agentName}`);
      this.addEvent("agent:response", { agentName: response.agentName, success: response.success });

      // Store as a message if not already stored
      const existingMsg = this.recentMessages.find((m) => !m.response);
      if (existingMsg) {
        existingMsg.response = response;
      } else {
        // This is an incoming message we didn't send
        this.recentMessages.unshift({
          id: `msg_${Date.now()}`,
          timestamp: new Date().toISOString(),
          content: "Incoming agent message",
          from: response.agentName,
          response: response
        });
        if (this.recentMessages.length > 100) this.recentMessages.pop();
      }

      this.broadcastSSE({ type: "agent:response", response });
    });

    this.sdk.on("room:created", (room) => {
      this.addEvent("room:created", { roomId: room.id, name: room.name });
      this.broadcastSSE({ type: "room:created", room });
    });

    this.sdk.on("room:updated", (room) => {
      this.addEvent("room:updated", { roomId: room.id, name: room.name });
      this.broadcastSSE({ type: "room:updated", room });
    });

    this.sdk.on("room:deleted", (roomId) => {
      this.addEvent("room:deleted", { roomId });
      this.broadcastSSE({ type: "room:deleted", roomId });
    });

    this.sdk.on("webhook:sent", (payload, url) => {
      this.addEvent("webhook:sent", { event: payload.event, url });
    });

    this.sdk.on("webhook:success", (response, url) => {
      this.addEvent("webhook:success", { url, status: response.status });
    });

    this.sdk.on("webhook:error", (error, url) => {
      this.addEvent("webhook:error", { error: error.message, url });
      this.errorCounter++;
    });

    this.sdk.on("error", (error) => {
      this.logger.error("SDK error:", error.message);
      this.errorCounter++;
      this.addEvent("error", { message: error.message, code: error.code });
      this.broadcastSSE({ type: "error", error: { message: error.message, code: error.code } });
    });

    this.sdk.on("ready", () => {
      this.logger.log("SDK ready");
      this.addEvent("ready", { message: "SDK ready" });
      this.broadcastSSE({ type: "ready" });
    });
  }

  private addEvent(type: string, data: any) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      data
    };
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 100) this.recentEvents.pop();
  }

  private broadcastSSE(data: any) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach((client) => {
      try {
        client.write(message);
      } catch (error) {
        this.sseClients.delete(client);
      }
    });
  }

  isConnected(): boolean {
    return this.sdk?.isConnected || false;
  }

  isAuthenticated(): boolean {
    return this.sdk?.isAuthenticated || false;
  }

  getHealth() {
    if (!this.sdk) {
      return { status: "unhealthy", error: "SDK not initialized" };
    }
    return this.sdk.getHealth();
  }

  getMetrics() {
    if (!this.sdk) {
      throw new Error("SDK not initialized");
    }

    const connectionState = this.sdk.getConnectionState();
    const authState = this.sdk.getAuthState();
    const agents = this.sdk.getAgents();
    const rooms = this.sdk.getRooms();

    return {
      connection: {
        connected: this.sdk.isConnected,
        authenticated: this.sdk.isAuthenticated,
        reconnectAttempts: connectionState.reconnectAttempts
      },
      auth: {
        walletAddress: authState.walletAddress,
        rooms: authState.rooms?.length || 0
      },
      agents: {
        total: agents.length,
        online: agents.filter((a) => a.status === "online").length
      },
      rooms: {
        total: rooms.length,
        subscribedRooms: this.sdk.getSubscribedRooms()
      },
      messages: {
        sent: this.messageCounter
      },
      errors: {
        total: this.errorCounter
      }
    };
  }

  async sendMessage(content: string, room: string, waitForResponse = false) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }

    this.messageCounter++;

    const messageId = `msg_${Date.now()}`;
    const storedMessage: any = {
      id: messageId,
      timestamp: new Date().toISOString(),
      content,
      from: "dashboard",
      room
    };
    this.recentMessages.unshift(storedMessage);
    if (this.recentMessages.length > 100) this.recentMessages.pop();

    const response = await this.sdk.sendMessage(content, {
      room,
      waitForResponse,
      timeout: 60000
    });

    if (response) {
      storedMessage.response = response;
    }

    return response;
  }

  async sendDirectCommand(agent: string, command: string, room?: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }

    return await this.sdk.sendDirectCommand({ agent, command, room });
  }

  getAgents() {
    return this.sdk?.getAgents() || [];
  }

  findAgentsByCapability(capability: string) {
    if (!this.sdk) {
      throw new Error("SDK not initialized");
    }
    return this.sdk.findAgentsByCapability(capability);
  }

  findAgentsByName(name: string) {
    if (!this.sdk) {
      throw new Error("SDK not initialized");
    }
    return this.sdk.findAgentsByName(name);
  }

  findAgentsByStatus(status: string) {
    if (!this.sdk) {
      throw new Error("SDK not initialized");
    }
    return this.sdk.findAgentsByStatus(status);
  }

  getRooms() {
    return this.sdk?.getRooms() || [];
  }

  getSubscribedRooms() {
    return this.sdk?.getSubscribedRooms() || [];
  }

  getOwnedRooms() {
    return this.sdk?.getOwnedRooms() || [];
  }

  getSharedRooms() {
    return this.sdk?.getSharedRooms() || [];
  }

  async listRooms() {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.listRooms();
  }

  async subscribeToRoom(roomId: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.subscribeToPublicRoom(roomId);
  }

  async unsubscribeFromRoom(roomId: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.unsubscribeFromPublicRoom(roomId);
  }

  async createRoom(name: string, description?: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.createRoom({ name, description });
  }

  async updateRoom(roomId: string, updates: { name?: string; description?: string }) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.updateRoom(roomId, updates);
  }

  async deleteRoom(roomId: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.deleteRoom(roomId);
  }

  getRoomLimit() {
    return this.sdk?.getRoomLimit();
  }

  getOwnedRoomCount() {
    return this.sdk?.getOwnedRoomCount();
  }

  canCreateRoom() {
    return this.sdk?.canCreateRoom();
  }

  async listRoomAgents(roomId: string, useCache = true) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.listRoomAgents(roomId, useCache);
  }

  async listAvailableAgents(roomId: string, useCache = true) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.listAvailableAgents(roomId, useCache);
  }

  async addAgentToRoom(roomId: string, agentId: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.addAgentToRoom(roomId, agentId);
  }

  async removeAgentFromRoom(roomId: string, agentId: string) {
    if (!this.sdk?.isConnected) {
      throw new Error("SDK not connected");
    }
    return await this.sdk.removeAgentFromRoom(roomId, agentId);
  }

  isAgentInRoom(roomId: string, agentId: string) {
    return this.sdk?.checkAgentInRoom(roomId, agentId) || false;
  }

  getRoomAgentCount(roomId: string) {
    return this.sdk?.getCachedRoomAgentCount(roomId) || 0;
  }

  invalidateAgentRoomCache(roomId: string) {
    this.sdk?.invalidateAgentRoomCache(roomId);
  }

  getSDK(): TeneoSDK | null {
    return this.sdk;
  }

  // SSE Management
  addSSEClient(client: any) {
    this.sseClients.add(client);
  }

  removeSSEClient(client: any) {
    this.sseClients.delete(client);
  }

  getRecentEvents() {
    return this.recentEvents.slice(0, 50);
  }

  getRecentMessages() {
    return this.recentMessages.slice(0, 20);
  }

  getRecentWebhooks() {
    return this.recentWebhooks.slice(0, 20);
  }

  addWebhook(webhook: any) {
    this.recentWebhooks.unshift({
      ...webhook,
      receivedAt: new Date().toISOString()
    });
    if (this.recentWebhooks.length > 50) this.recentWebhooks.pop();
    this.broadcastSSE({ type: "webhook:received", payload: webhook });
  }
}
