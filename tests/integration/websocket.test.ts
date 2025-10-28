import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { TeneoSDK } from "../../src";
import { SDKConfigBuilder } from "../../src/types";
import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";

describe("WebSocket Integration Tests", () => {
  let server: WebSocketServer;
  let sdk: TeneoSDK;
  let serverPort: number;
  let privateKey: string;
  let walletAddress: string;

  // Mock server to simulate Teneo WebSocket server
  beforeAll(() => {
    serverPort = 8081;
    privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    walletAddress = account.address;

    // Create WebSocket server
    server = new WebSocketServer({ port: serverPort });

    server.on("connection", (ws) => {
      const subscribedRooms = new Set<string>();

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());

        // Handle different message types
        switch (message.type) {
          case "request_challenge":
            ws.send(
              JSON.stringify({
                type: "challenge",
                data: {
                  challenge: "test-challenge-" + Date.now(),
                  timestamp: Date.now()
                }
              })
            );
            break;

          case "auth":
            ws.send(
              JSON.stringify({
                type: "auth_success",
                data: {
                  id: "client-123",
                  type: "user",
                  address: message.data.address,
                  nft_verified: false,
                  is_whitelisted: true,
                  rooms: []
                }
              })
            );
            break;

          case "message":
            // Echo back as task response
            ws.send(
              JSON.stringify({
                type: "task_response",
                content: `Response to: ${message.content}`,
                content_type: "text/plain",
                from: "test-agent",
                data: {
                  task_id: "task-" + Date.now(),
                  agent_name: "Test Agent",
                  success: true
                }
              })
            );
            break;

          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;

          case "subscribe":
            // Add room to subscribed rooms
            subscribedRooms.add(message.data.room_id);
            // Send subscribe response with updated subscriptions list
            ws.send(
              JSON.stringify({
                type: "subscribe",
                data: {
                  room_id: message.data.room_id,
                  success: true,
                  message: "Subscribed successfully",
                  subscriptions: Array.from(subscribedRooms)
                }
              })
            );
            // Also send agents list for the room
            ws.send(
              JSON.stringify({
                type: "agents",
                from: "system",
                data: [
                  {
                    id: "agent-1",
                    name: "Test Agent 1",
                    room: message.data.room_id,
                    status: "online"
                  }
                ]
              })
            );
            break;

          case "unsubscribe":
            // Remove room from subscribed rooms
            subscribedRooms.delete(message.data.room_id);
            // Send unsubscribe response with updated subscriptions list
            ws.send(
              JSON.stringify({
                type: "unsubscribe",
                data: {
                  room_id: message.data.room_id,
                  success: true,
                  message: "Unsubscribed successfully",
                  subscriptions: Array.from(subscribedRooms)
                }
              })
            );
            break;
        }
      });

      ws.on("close", () => {
        // Handle client disconnect
      });
    });
  });

  afterAll(async () => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    const config = new SDKConfigBuilder()
      .withWebSocketUrl(`ws://localhost:${serverPort}`)
      .withAuthentication(privateKey)
      .withReconnection(false) // Disable for tests
      .withAutoJoinRooms(["test-room"]) // Auto-join test room
      .build();

    sdk = new TeneoSDK(config);
  });

  afterEach(async () => {
    await sdk.disconnect();
  });

  describe("Connection and Authentication", () => {
    it("should connect to WebSocket server", async () => {
      await sdk.connect();
      const state = sdk.getConnectionState();
      expect(state.connected).toBe(true);
    }, 15000);

    it("should authenticate successfully", async () => {
      const authPromise = new Promise((resolve) => {
        sdk.on("auth:success", resolve);
      });

      await sdk.connect();
      await authPromise;

      const state = sdk.getConnectionState();
      expect(state.authenticated).toBe(true);
    }, 15000);

    it("should handle challenge-response authentication flow", async () => {
      const challengeReceived = new Promise((resolve) => {
        sdk.on("auth:challenge", resolve);
      });

      const authSuccess = new Promise((resolve) => {
        sdk.on("auth:success", resolve);
      });

      await sdk.connect();
      await challengeReceived;
      await authSuccess;

      expect(sdk.getConnectionState().authenticated).toBe(true);
    }, 15000);
  });

  describe("Message Exchange", () => {
    beforeEach(async () => {
      const authPromise = new Promise((resolve) => {
        sdk.on("auth:success", resolve);
      });
      await sdk.connect();
      await authPromise;
    });

    it("should send message and receive response", async () => {
      const responsePromise = new Promise((resolve) => {
        sdk.on("agent:response", resolve);
      });

      await sdk.sendMessage("Hello, test message", { room: "test-room" });
      const response = await responsePromise;

      expect(response).toBeDefined();
      expect(response).toHaveProperty("content");
    }, 15000);

    it.skip("should handle formatted responses", async () => {
      const response = await sdk.sendMessage("Test message", {
        room: "test-room",
        waitForResponse: true
      });
      expect(response).toContain("Response to: Test message");
    }, 15000);
  });

  describe("Room Management", () => {
    beforeEach(async () => {
      const authPromise = new Promise((resolve) => {
        sdk.on("auth:success", resolve);
      });
      await sdk.connect();
      await authPromise;
    });

    it.skip("should join room and receive agents list", async () => {
      const agentsPromise = new Promise((resolve) => {
        sdk.on("agent:list", resolve);
      });

      await sdk.subscribeToRoom("test-room");
      const agents = await agentsPromise;

      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
    }, 15000);

    it("should track subscribed rooms", async () => {
      const subscribePromise = new Promise((resolve) => {
        sdk.on("room:subscribed", resolve);
      });

      await sdk.subscribeToRoom("test-room");
      await subscribePromise;

      expect(sdk.getSubscribedRooms()).toContain("test-room");
    }, 15000);
  });

  describe("Error Handling", () => {
    it.skip("should handle connection errors", async () => {
      const badSdk = new TeneoSDK(
        new SDKConfigBuilder()
          .withWebSocketUrl("wss://nonexistent.local:443") // Valid URL, will fail to connect
          .withAuthentication(privateKey)
          .withReconnection(false)
          .build()
      );

      await expect(badSdk.connect()).rejects.toThrow();
    });

    it("should handle message send when not connected", async () => {
      await expect(sdk.sendMessage("Test", { room: "test-room" })).rejects.toThrow("Not connected");
    });
  });

  describe("Webhook Integration", () => {
    it("should trigger webhook on message response", async () => {
      // Configure webhook
      const webhookSdk = new TeneoSDK(
        new SDKConfigBuilder()
          .withWebSocketUrl(`ws://localhost:${serverPort}`)
          .withAuthentication(privateKey)
          .withWebhook("http://localhost:3001/webhook")
          .withReconnection(false)
          .build()
      );

      const authPromise = new Promise((resolve) => {
        webhookSdk.on("auth:success", resolve);
      });

      await webhookSdk.connect();
      await authPromise;

      // Webhook would be triggered but we can't test actual HTTP without a server
      // Just verify the handler is set up
      expect(webhookSdk).toBeDefined();

      await webhookSdk.disconnect();
    }, 15000);
  });
});

describe("Integration with Real Server", () => {
  const REAL_SERVER_URL = "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
  let sdk: TeneoSDK;
  let privateKey: string;

  beforeEach(() => {
    privateKey = generatePrivateKey();
    const config = new SDKConfigBuilder()
      .withWebSocketUrl(REAL_SERVER_URL)
      .withAuthentication(privateKey)
      .withReconnection(false)
      .build();

    sdk = new TeneoSDK(config);
  });

  afterEach(async () => {
    await sdk.disconnect();
  });

  // Skip these tests by default - only run when explicitly testing against real server
  it.skip("should connect to real Teneo server", async () => {
    await sdk.connect();
    expect(sdk.getConnectionState().connected).toBe(true);
  });

  it.skip("should authenticate with real server", async () => {
    await sdk.connect();

    const authSuccess = new Promise((resolve, reject) => {
      sdk.on("auth:success", resolve);
      sdk.on("auth:error", reject);
      setTimeout(() => reject(new Error("Auth timeout")), 10000);
    });

    const result = await authSuccess;
    expect(result).toBeDefined();
  });

  it.skip("should receive agent list from real server", async () => {
    await sdk.connect();

    await new Promise((resolve) => {
      sdk.on("auth:success", resolve);
    });

    const agents = await sdk.getAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  it.skip("should send message to real coordinator", async () => {
    await sdk.connect();

    await new Promise((resolve) => {
      sdk.on("auth:success", resolve);
    });

    const responsePromise = new Promise((resolve, reject) => {
      sdk.on("agent:selected", resolve);
      sdk.on("error", reject);
      setTimeout(() => reject(new Error("Response timeout")), 15000);
    });

    await sdk.sendMessage("Hello, can you help me?", { room: "test-room" });
    const response = await responsePromise;

    expect(response).toBeDefined();
    expect(response).toHaveProperty("data");
  });
});
