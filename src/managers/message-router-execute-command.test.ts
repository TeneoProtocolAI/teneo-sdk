/**
 * Unit tests for MessageRouter.executeCommand — roomless one-shot direct execution.
 *
 * Covers:
 *   - Wire shape of the outgoing api_execute message (no room field)
 *   - Validation errors for empty agent / empty command
 *   - Quote-approve path: api_execute → task_quote → auto-confirm → response
 *   - Legacy / no-payment path: api_execute → task_response, waitForResponse behaviour
 *
 * The WebSocketClient is stubbed with a plain EventEmitter plus a minimal
 * surface of methods/getters the router actually calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { WebSocketClient } from "../core/websocket-client";
import { MessageRouter } from "./message-router";
import { setNetworkConfigUrl, fetchNetworkConfigs } from "../payments/networks";

// Minimal mocked network config so getResolvedPaymentNetwork() can resolve
// defaults during tests without hitting the real backend.
const mockNetworkData = {
  networks: {
    peaq: {
      chainId: 3338,
      name: "PEAQ Mainnet",
      caip2: "eip155:3338",
      rpcUrl: "https://peaq.network/rpc",
      usdcContract: "0xbbA60da06c2c5424f03f7434542280FCAd453d10",
      settlementRouter: "0x0000000000000000000000000000000000000001",
      transferHook: "0x0000000000000000000000000000000000000002",
      eip712: { name: "USDC", version: "2" }
    },
    base: {
      chainId: 8453,
      name: "Base Mainnet",
      caip2: "eip155:8453",
      rpcUrl: "https://mainnet.base.org",
      usdcContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      settlementRouter: "0x0000000000000000000000000000000000000003",
      transferHook: "0x0000000000000000000000000000000000000004",
      eip712: { name: "USD Coin", version: "2" }
    }
  }
};

type StubClient = EventEmitter & {
  isConnected: boolean;
  getAuthState: () => { walletAddress: string };
  sendMessage: ReturnType<typeof vi.fn>;
};

function makeStubClient(): StubClient {
  const emitter = new EventEmitter() as StubClient;
  emitter.isConnected = true;
  emitter.getAuthState = () => ({ walletAddress: "0xUSERWALLET" });
  emitter.sendMessage = vi.fn().mockResolvedValue(undefined);
  return emitter;
}

function makeRouter(
  wsClient: StubClient,
  overrides: Partial<ConstructorParameters<typeof MessageRouter>[4]> = {}
) {
  const webhookHandler = {
    sendMessageWebhook: vi.fn().mockResolvedValue(undefined),
    sendWebhook: vi.fn().mockResolvedValue(undefined)
  } as any;
  const responseFormatter = { formatTaskResponse: vi.fn() } as any;
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;

  return new MessageRouter(
    wsClient as unknown as WebSocketClient,
    webhookHandler,
    responseFormatter,
    logger,
    { messageTimeout: 500, quoteTimeout: 500, ...overrides }
  );
}

describe("MessageRouter.executeCommand", () => {
  let wsClient: StubClient;

  beforeEach(async () => {
    // Stub fetch + initialize networks so the router's network resolution
    // doesn't blow up when it reaches for peaq as the default.
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockNetworkData)
      } as Response)
    );
    setNetworkConfigUrl("https://backend.test.com/ws");
    await fetchNetworkConfigs();

    wsClient = makeStubClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("outgoing wire shape", () => {
    it("sends an api_execute message with no room field and assembled @agent content", async () => {
      const router = makeRouter(wsClient, { autoApproveQuotes: false });

      await router.executeCommand({
        agent: "weather-agent",
        command: "forecast Tokyo"
      });

      expect(wsClient.sendMessage).toHaveBeenCalledTimes(1);
      const sent = wsClient.sendMessage.mock.calls[0][0];
      expect(sent.type).toBe("api_execute");
      expect(sent.content).toBe("@weather-agent forecast Tokyo");
      // The whole point: no room on the wire.
      expect(sent.room).toBeUndefined();
      // from is populated from authState.walletAddress
      expect(sent.from).toBe("0xUSERWALLET");
      // Correlation id goes on the top-level request_id field — that's what
      // the server's api_execute handler reads (msg.RequestID). NOT in data.
      expect(sent.request_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(sent.data?.client_request_id).toBeUndefined();
    });

    it("passes the network override through to data.network", async () => {
      const router = makeRouter(wsClient, { autoApproveQuotes: false });

      await router.executeCommand({
        agent: "x-agent",
        command: "user @elon",
        network: "base"
      });

      const sent = wsClient.sendMessage.mock.calls[0][0];
      // Resolved network can be either the raw name or the CAIP-2 form,
      // depending on whether networks are initialized. Either way it must
      // be present and reflect the caller's intent.
      expect(sent.data?.network).toBeTruthy();
    });
  });

  describe("validation", () => {
    it("throws ValidationError for empty agent", async () => {
      const router = makeRouter(wsClient);
      await expect(router.executeCommand({ agent: "", command: "do stuff" })).rejects.toThrow();
    });

    it("throws ValidationError for empty command", async () => {
      const router = makeRouter(wsClient);
      await expect(
        router.executeCommand({ agent: "weather-agent", command: "" })
      ).rejects.toThrow();
    });

    it("throws SDKError when not connected", async () => {
      wsClient.isConnected = false;
      const router = makeRouter(wsClient);
      await expect(router.executeCommand({ agent: "weather-agent", command: "x" })).rejects.toThrow(
        /not connected/i
      );
    });
  });

  describe("quote-approve path (autoApproveQuotes: true)", () => {
    it("sends api_execute, awaits quote:received, then confirms", async () => {
      const router = makeRouter(wsClient, { autoApproveQuotes: true });

      const execPromise = router.executeCommand(
        { agent: "weather-agent", command: "forecast Tokyo" },
        true
      );

      // Wait a microtask so the router has sent api_execute and attached
      // the quote:received listener before we emit.
      await new Promise((r) => setImmediate(r));

      // Grab the correlation id the router generated (top-level request_id)
      const sent = wsClient.sendMessage.mock.calls[0][0];
      expect(sent.type).toBe("api_execute");
      const clientRequestId = sent.request_id as string;
      expect(clientRequestId).toBeTruthy();

      // Simulate server response: task_quote with settlement fields
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      wsClient.emit("quote:received", {
        type: "task_quote",
        from: "coordinator",
        data: {
          task_id: "task-xyz",
          agent_id: "weather-agent",
          agent_name: "Weather Agent",
          agent_wallet: "0xAGENT",
          command: "@weather-agent forecast Tokyo",
          pricing: { pricePerUnit: 0, currency: "USDC" },
          expires_at: expiresAt,
          settlement_router: "0xROUTER",
          salt: "0xSALT",
          facilitator_fee: "0",
          hook: "0xHOOK",
          hook_data: "0x",
          client_request_id: clientRequestId
        }
      });

      // Wait for router to send confirm_task
      await new Promise((r) => setImmediate(r));

      // The router should now have sent confirm_task as the second message
      expect(wsClient.sendMessage).toHaveBeenCalledTimes(2);
      const confirmMsg = wsClient.sendMessage.mock.calls[1][0];
      expect(confirmMsg.type).toBe("confirm_task");
      expect(confirmMsg.data.task_id).toBe("task-xyz");

      // Simulate agent:response for the confirmed task so the awaiter resolves
      wsClient.emit("agent:response", {
        taskId: "task-xyz",
        agentId: "weather-agent",
        content: "It will rain.",
        success: true,
        timestamp: new Date()
      });

      const result = await execPromise;
      expect(result).toBeDefined();
      expect((result as any).content).toBe("It will rain.");
    });
  });

  describe("legacy / no-payment path (autoApproveQuotes: false)", () => {
    it("with waitForResponse=false, fires and forgets", async () => {
      const router = makeRouter(wsClient, { autoApproveQuotes: false });

      const result = await router.executeCommand(
        { agent: "weather-agent", command: "forecast" },
        false
      );

      expect(result).toBeUndefined();
      expect(wsClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(wsClient.sendMessage.mock.calls[0][0].type).toBe("api_execute");
    });

    it("with waitForResponse=true, resolves on agent:response matching clientRequestId", async () => {
      const router = makeRouter(wsClient, { autoApproveQuotes: false });

      const execPromise = router.executeCommand(
        { agent: "weather-agent", command: "forecast" },
        true
      );

      await new Promise((r) => setImmediate(r));
      const sent = wsClient.sendMessage.mock.calls[0][0];
      const clientRequestId = sent.request_id as string;
      expect(clientRequestId).toBeTruthy();

      // Non-matching response should NOT resolve the await
      wsClient.emit("agent:response", {
        taskId: "other-task",
        agentId: "other-agent",
        content: "stray",
        success: true,
        timestamp: new Date(),
        raw: {
          type: "task_response",
          content: "stray",
          content_type: "text/plain",
          from: "other-agent",
          data: { task_id: "other-task", client_request_id: "different-id" }
        }
      });

      // Matching response — this is what we should get back
      wsClient.emit("agent:response", {
        taskId: "task-abc",
        agentId: "weather-agent",
        content: "Sunny.",
        success: true,
        timestamp: new Date(),
        raw: {
          type: "task_response",
          content: "Sunny.",
          content_type: "text/plain",
          from: "weather-agent",
          data: { task_id: "task-abc", client_request_id: clientRequestId }
        }
      });

      const result = await execPromise;
      expect((result as any).content).toBe("Sunny.");
      expect((result as any).taskId).toBe("task-abc");
    });
  });
});
