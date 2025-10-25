import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketClient } from "./websocket-client";
import { ConnectionError, AuthenticationError, TimeoutError } from "../types/events";
import type { SDKConfig } from "../types/config";
import WebSocket from "ws";
import { privateKeyToAccount } from "viem/accounts";

// Mock WebSocket
vi.mock("ws", () => {
  return {
    default: vi.fn(),
    WebSocket: vi.fn()
  };
});

// Mock viem
vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn()
}));

describe("WebSocketClient", () => {
  let client: WebSocketClient;
  let mockConfig: SDKConfig;
  let mockWs: any;
  let mockAccount: any;

  // Helper to simulate successful authentication
  const simulateAuth = (client: any) => {
    // Update auth state to bypass authentication wait
    client.updateAuthState({ authenticated: true });
    client.emit("ready");
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockConfig = {
      wsUrl: "wss://example.com/ws",
      privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
      reconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 3,
      connectionTimeout: 10000,
      messageTimeout: 10000,
      logLevel: "info"
    } as SDKConfig;

    // Create mock WebSocket instance
    mockWs = {
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn((data: any, callback?: any) => callback && callback()),
      close: vi.fn(),
      ping: vi.fn((callback?: any) => callback && callback()),
      terminate: vi.fn(),
      readyState: WebSocket.OPEN,
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      removeAllListeners: vi.fn(),
      removeListener: vi.fn()
    };

    // Mock WebSocket constructor
    (WebSocket as any).mockImplementation(() => mockWs);

    // Mock viem account
    mockAccount = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6",
      signMessage: vi.fn().mockResolvedValue("0xmocked_signature")
    };
    (privateKeyToAccount as any).mockReturnValue(mockAccount);

    client = new WebSocketClient(mockConfig);
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with config", () => {
      expect(client).toBeDefined();
      // SEC-3: Private key should be removed from config after initialization
      const expectedConfig = { ...mockConfig, privateKey: undefined };
      expect((client as any).config).toStrictEqual(expectedConfig);
      expect(client.isConnected).toBe(false);
      expect(client.isAuthenticated).toBe(false);
    });

    it("should initialize wallet account", () => {
      expect(privateKeyToAccount).toHaveBeenCalledWith(mockConfig.privateKey);
      expect((client as any).account).toBe(mockAccount);
    });
  });

  describe("connect", () => {
    it("should establish WebSocket connection", async () => {
      const connectPromise = client.connect();

      // Simulate connection open
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        // Simulate successful auth immediately
        simulateAuth(client);
        await openHandler();
      }

      await connectPromise;

      expect(WebSocket).toHaveBeenCalled();
      expect(client.isConnected).toBe(true);
    });

    it("should emit connection events", async () => {
      const openHandler = vi.fn();

      client.on("connection:open", openHandler);

      const connectPromise = client.connect();

      // Simulate connection open
      const wsOpenHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (wsOpenHandler) {
        simulateAuth(client);
        await wsOpenHandler();
      }

      await connectPromise;

      expect(openHandler).toHaveBeenCalled();
    });

    it("should handle connection error", async () => {
      const errorHandler = vi.fn();
      client.on("connection:error", errorHandler);

      const connectPromise = client.connect();

      // Simulate connection error
      const wsErrorHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "error")?.[1];
      const error = new Error("Connection failed");
      wsErrorHandler?.(error);

      try {
        await connectPromise;
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionError);
      }

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it.skip("should not connect if already connected", async () => {
      // First connection
      const connectPromise1 = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise1;

      // Clear mock calls
      (WebSocket as any).mockClear();

      // Second connection attempt - should disconnect first
      const connectPromise2 = client.connect();
      const openHandler2 = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler2) {
        simulateAuth(client);
        await openHandler2();
      }
      await connectPromise2;

      // WebSocket should be created again (due to disconnect in connect())
      expect(WebSocket).toHaveBeenCalled();
    }, 15000);

    it("should setup message handler", async () => {
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;

      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "message")?.[1];
      expect(messageHandler).toBeDefined();
    });

    it("should setup close handler", async () => {
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;

      const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1];
      expect(closeHandler).toBeDefined();
    });
  });

  describe("sendMessage", () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;
    });

    it("should send message when connected", async () => {
      const message = { type: "message" as const, content: "test" };
      await client.sendMessage(message);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"content":"test"'),
        expect.any(Function)
      );
    });

    it("should throw error when not connected", async () => {
      // Create a new client that's never connected
      const disconnectedClient = new WebSocketClient(mockConfig);

      const message = { type: "message" as const, content: "test" };
      await expect(disconnectedClient.sendMessage(message)).rejects.toThrow();
    });

    it("should handle send errors", async () => {
      mockWs.send.mockImplementationOnce((data: any, callback: any) => {
        callback(new Error("Send failed"));
      });

      const message = { type: "message" as const, content: "test" };
      await expect(client.sendMessage(message)).rejects.toThrow("Send failed");
    });
  });

  describe("reconnection logic", () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;
    });

    it.skip("should attempt reconnection on disconnect", async () => {
      const reconnectingHandler = vi.fn();
      client.on("connection:reconnecting", reconnectingHandler);

      // Simulate disconnect
      const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1];
      closeHandler?.(1006, "Connection lost");

      // Should emit reconnecting event
      expect(reconnectingHandler).toHaveBeenCalledWith(1);

      // Clear previous mock
      (WebSocket as any).mockClear();

      // Advance timer to trigger reconnection
      vi.advanceTimersByTime(mockConfig.reconnectDelay!);

      // Should create new WebSocket
      expect(WebSocket).toHaveBeenCalledWith(mockConfig.wsUrl);
    });

    it.skip("should use exponential backoff for reconnection", async () => {
      // Simulate multiple failed reconnection attempts
      for (let i = 1; i <= 3; i++) {
        const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1];
        closeHandler?.(1006, "Connection lost");

        (WebSocket as any).mockClear();

        // Calculate expected delay with exponential backoff
        const expectedDelay = mockConfig.reconnectDelay! * Math.pow(2, i - 1);
        vi.advanceTimersByTime(expectedDelay);

        if (i < 3) {
          expect(WebSocket).toHaveBeenCalled();
        }
      }
    });

    it.skip("should stop reconnecting after max attempts", async () => {
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      // Simulate max failed attempts
      for (let i = 1; i <= mockConfig.maxReconnectAttempts! + 1; i++) {
        const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1];
        closeHandler?.(1006, "Connection lost");

        if (i <= mockConfig.maxReconnectAttempts!) {
          vi.advanceTimersByTime(mockConfig.reconnectDelay! * Math.pow(2, i - 1));
        }
      }

      // Should emit error after max attempts
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Max reconnection attempts")
        })
      );
    });

    it.skip("should not reconnect if reconnect is false", () => {
      const noReconnectConfig = { ...mockConfig, reconnect: false };
      const noReconnectClient = new WebSocketClient(noReconnectConfig);

      // Connect
      noReconnectClient.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      openHandler?.();

      (WebSocket as any).mockClear();

      // Simulate disconnect
      const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "close")?.[1];
      closeHandler?.(1000, "Normal closure");

      // Advance timers
      vi.advanceTimersByTime(10000);

      // Should not attempt reconnection
      expect(WebSocket).not.toHaveBeenCalled();

      noReconnectClient.disconnect();
    });
  });

  describe("message handling", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;
    });

    it("should handle and validate incoming messages", () => {
      const messageHandler = vi.fn();
      client.on("message:received", messageHandler);

      const wsMessageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "message")?.[1];

      const validMessage = JSON.stringify({
        type: "task_response",
        content: "test response",
        from: "agent-1",
        content_type: "text/plain",
        data: {
          task_id: "task-123",
          success: true
        }
      });

      wsMessageHandler?.(Buffer.from(validMessage));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task_response",
          content: "test response"
        })
      );
    });

    it("should handle invalid messages", () => {
      const errorHandler = vi.fn();
      client.on("message:error", errorHandler);

      const wsMessageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "message")?.[1];

      // Invalid JSON
      wsMessageHandler?.(Buffer.from("invalid json"));

      expect(errorHandler).toHaveBeenCalled();
    });

    it.skip("should emit typed events for specific messages", () => {
      const agentSelectedHandler = vi.fn();
      const agentResponseHandler = vi.fn();

      client.on("agent:selected", agentSelectedHandler);
      client.on("agent:response", agentResponseHandler);

      const wsMessageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "message")?.[1];

      // Agent selected message
      wsMessageHandler?.(
        Buffer.from(
          JSON.stringify({
            type: "agent_selected",
            content: "selected",
            from: "coordinator",
            reasoning: "Best match",
            data: {
              agent_id: "agent-1",
              agent_name: "Test Agent",
              user_request: "help"
            }
          })
        )
      );

      expect(agentSelectedHandler).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;
    });

    it.skip("should close WebSocket connection", () => {
      client.disconnect();

      expect(mockWs.close).toHaveBeenCalledWith(1000, "Client disconnect");
      expect(client.isConnected).toBe(false);
    });

    it("should clear intervals", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      client.disconnect();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("should emit disconnect event", () => {
      const disconnectHandler = vi.fn();
      client.on("disconnect", disconnectHandler);

      client.disconnect();

      expect(disconnectHandler).toHaveBeenCalled();
    });

    it.skip("should handle multiple disconnect calls", () => {
      client.disconnect();
      client.disconnect();
      client.disconnect();

      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("getConnectionState", () => {
    it("should return current connection state", () => {
      const state = client.getConnectionState();

      expect(state).toEqual(
        expect.objectContaining({
          connected: false,
          authenticated: false,
          reconnecting: false,
          reconnectAttempts: 0
        })
      );
    });

    it("should update state after connection", async () => {
      const connectPromise = client.connect();
      const openHandler = mockWs.on.mock.calls.find((call: any) => call[0] === "open")?.[1];
      if (openHandler) {
        simulateAuth(client);
        await openHandler();
      }
      await connectPromise;

      const state = client.getConnectionState();
      expect(state.connected).toBe(true);
    });
  });

  describe("getAuthState", () => {
    it("should return current auth state", () => {
      const state = client.getAuthState();

      expect(state).toEqual(
        expect.objectContaining({
          authenticated: false
        })
      );
    });
  });
});
