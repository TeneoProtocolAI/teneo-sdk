/**
 * Unit tests for MessageRouter autosummon functionality
 * Tests pre-flight autosummon, fallback autosummon, lifecycle events,
 * cache hit/miss scenarios, and error handling with mocked dependencies.
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import { MessageRouter, MessageRouterConfig } from "../../../src/managers/message-router";
import { AgentRoomManager } from "../../../src/managers/agent-room-manager";
import { Logger } from "../../../src/types";

type EmittedEvent = { name: string; args: any[] };

/**
 * Creates a mock wsClient backed by a real EventEmitter so that
 * waitForEvent / .on() / .off() work correctly in MessageRouter.
 */
function createMockWsClient() {
  const ee = new EventEmitter();
  const emittedEvents: EmittedEvent[] = [];
  const originalEmit = ee.emit.bind(ee);

  const mock = Object.assign(ee, {
    isConnected: true,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    _emittedEvents: emittedEvents
  });

  // Intercept emit to record events for assertions
  mock.emit = ((...args: any[]) => {
    const [name, ...rest] = args;
    emittedEvents.push({ name, args: rest });
    return originalEmit(name, ...rest);
  }) as any;

  return mock;
}

function createMockLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createMockAgentRoomManager(
  opts: {
    checkAgentInRoom?: boolean | undefined;
    availableAgents?: Array<{ agent_id: string; agent_name: string }>;
    addAgentThrows?: Error;
  } = {}
) {
  return {
    checkAgentInRoom: vi.fn().mockReturnValue(opts.checkAgentInRoom),
    listAvailableAgents: vi.fn().mockResolvedValue(opts.availableAgents || []),
    addAgentToRoom: opts.addAgentThrows
      ? vi.fn().mockRejectedValue(opts.addAgentThrows)
      : vi.fn().mockResolvedValue(undefined)
  } as any as AgentRoomManager;
}

const QUOTE_DATA = {
  data: {
    task_id: "t1",
    agent_id: "news-agent",
    agent_name: "news-agent",
    agent_wallet: "0x123",
    command: "latest",
    pricing: { price: 0 },
    expires_at: new Date(Date.now() + 60000).toISOString(),
    settlement_router: "0x",
    salt: "0x",
    facilitator_fee: "0",
    hook: "0x"
  }
};

function createRouter(overrides: Partial<MessageRouterConfig> = {}) {
  const wsClient = createMockWsClient();
  const config: MessageRouterConfig = {
    messageTimeout: 5000,
    autoApproveQuotes: true,
    quoteTimeout: 3000,
    autoSummon: true,
    paymentNetwork: "eip155:8453", // Avoids getDefaultNetwork() call
    ...overrides
  };

  const webhookHandler = {
    sendMessageWebhook: vi.fn().mockResolvedValue(undefined),
    sendWebhook: vi.fn().mockResolvedValue(undefined)
  } as any;

  const responseFormatter = {
    format: vi.fn((data: any) => ({ humanized: data.content || "", raw: data }))
  } as any;

  const router = new MessageRouter(
    wsClient as any,
    webhookHandler,
    responseFormatter,
    createMockLogger(),
    config
  );

  return { router, wsClient };
}

/** Helper: fire quote:received to resolve a pending _requestQuoteInternal */
function resolveQuote(wsClient: ReturnType<typeof createMockWsClient>) {
  wsClient.emit("quote:received", QUOTE_DATA);
}

describe("MessageRouter: Autosummon", () => {
  it("should tag request_task with the configured request source", async () => {
    const { router, wsClient } = createRouter({ requestSource: "cli" });

    const promise = (router as any)._requestQuoteInternal(
      "@news-agent latest", "room-1", undefined, false
    );

    await vi.waitFor(() => {
      expect(wsClient.sendMessage).toHaveBeenCalled();
    });

    const sentMessage = (wsClient.sendMessage as any).mock.calls[0][0];
    expect(sentMessage.type).toBe("request_task");
    expect(sentMessage.data.request_source).toBe("cli");

    resolveQuote(wsClient);
    await promise;
  });

  it("should tag confirm_task with the configured request source", async () => {
    const { router, wsClient } = createRouter({ requestSource: "cli" });
    (router as any).pendingQuotes.set("task-1", {
      taskId: "task-1",
      agentId: "news-agent",
      agentName: "news-agent",
      agentWallet: "0x123",
      command: "latest",
      pricing: { pricePerUnit: 0, priceType: "task-transaction", taskUnit: "per-query" },
      expiresAt: new Date(Date.now() + 60_000),
      settlement: {
        settlementRouter: "0x",
        salt: "0x",
        facilitatorFee: "0",
        hook: "0x",
        hookData: "0x"
      }
    });

    await router.confirmQuote("task-1");

    const sentMessage = (wsClient.sendMessage as any).mock.calls[0][0];
    expect(sentMessage.type).toBe("confirm_task");
    expect(sentMessage.data.request_source).toBe("cli");
  });

  describe("pre-flight autosummon (cache says agent NOT in room)", () => {
    it("should add agent to room before sending command", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({
        checkAgentInRoom: false,
        availableAgents: [{ agent_id: "news-agent", agent_name: "news-agent" }]
      });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      await vi.waitFor(() => {
        expect(arm.addAgentToRoom).toHaveBeenCalledWith("room-1", "news-agent");
      });

      resolveQuote(wsClient);
      const result = await promise;
      expect(result.agentId).toBe("news-agent");
    });

    it("should emit autosummon:start and autosummon:success events", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({
        checkAgentInRoom: false,
        availableAgents: [{ agent_id: "news-agent", agent_name: "news-agent" }]
      });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      await vi.waitFor(() => {
        expect(arm.addAgentToRoom).toHaveBeenCalled();
      });

      const events = wsClient._emittedEvents;
      const start = events.find((e) => e.name === "autosummon:start");
      const success = events.find((e) => e.name === "autosummon:success");

      expect(start).toBeDefined();
      expect(start!.args).toEqual(["news-agent", "room-1"]);
      expect(success).toBeDefined();
      expect(success!.args).toEqual(["news-agent", "news-agent", "room-1"]);

      resolveQuote(wsClient);
      await promise;
    });

    it("should emit autosummon:failed when agent not found in available list", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({
        checkAgentInRoom: false,
        availableAgents: [] // not found
      });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@ghost-agent test",
        "room-1",
        undefined,
        false
      );

      await vi.waitFor(() => {
        const failed = wsClient._emittedEvents.find((e) => e.name === "autosummon:failed");
        expect(failed).toBeDefined();
      });

      const failed = wsClient._emittedEvents.find((e) => e.name === "autosummon:failed");
      expect(failed!.args[0]).toBe("ghost-agent");
      expect(failed!.args[1]).toBe("room-1");
      expect(failed!.args[2]).toBe("Agent not found or offline");

      // Command should still be sent (fallback continues)
      expect(wsClient.sendMessage).toHaveBeenCalled();

      resolveQuote(wsClient);
      await promise.catch(() => {});
    });
  });

  describe("skip pre-flight (agent already in room)", () => {
    it("should not trigger autosummon when cache says agent IS in room", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({ checkAgentInRoom: true });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      // Wait for sendMessage to be called (no pre-flight delay)
      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      expect(arm.addAgentToRoom).not.toHaveBeenCalled();
      expect(wsClient._emittedEvents.find((e) => e.name === "autosummon:start")).toBeUndefined();

      resolveQuote(wsClient);
      await promise;
    });
  });

  describe("skip pre-flight (cache empty — undefined)", () => {
    it("should skip pre-flight and send directly when cache is empty", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({ checkAgentInRoom: undefined });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      expect(arm.addAgentToRoom).not.toHaveBeenCalled();
      expect(arm.listAvailableAgents).not.toHaveBeenCalled();
      expect(wsClient._emittedEvents.find((e) => e.name === "autosummon:start")).toBeUndefined();

      resolveQuote(wsClient);
      await promise;
    });
  });

  describe("autoSummon disabled", () => {
    it("should never trigger pre-flight when autoSummon is false", async () => {
      const { router, wsClient } = createRouter({ autoSummon: false });
      const arm = createMockAgentRoomManager({ checkAgentInRoom: false });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      expect(arm.checkAgentInRoom).not.toHaveBeenCalled();
      expect(arm.addAgentToRoom).not.toHaveBeenCalled();

      resolveQuote(wsClient);
      await promise;
    });
  });

  describe("fallback autosummon (coordinator rejects)", () => {
    it("should emit events when fallback path triggers on coordinator reject", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({
        checkAgentInRoom: undefined, // cache empty → pre-flight skipped
        availableAgents: [{ agent_id: "news-agent", agent_name: "news-agent" }]
      });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      // Wait for sendMessage, then fire coordinator reject
      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      wsClient.emit("agent:response", {
        content: "agent news-agent does not have access to room room-1",
        agentId: "coordinator"
      });

      // handleAutoSummon fires, adds agent, retries
      await vi.waitFor(() => {
        expect(arm.addAgentToRoom).toHaveBeenCalledWith("room-1", "news-agent");
      });

      const events = wsClient._emittedEvents;
      expect(events.find((e) => e.name === "autosummon:start")).toBeDefined();
      expect(events.find((e) => e.name === "autosummon:success")).toBeDefined();

      // Retry sends another quote request — resolve it
      resolveQuote(wsClient);
      const result = await promise;
      expect(result.agentId).toBe("news-agent");
    });
  });

  describe("isRetry prevents double-summon", () => {
    it("should skip pre-flight on retry even if cache says agent not in room", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({ checkAgentInRoom: false });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        true // isRetry
      );

      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      expect(arm.checkAgentInRoom).not.toHaveBeenCalled();
      expect(arm.addAgentToRoom).not.toHaveBeenCalled();

      resolveQuote(wsClient);
      await promise;
    });
  });

  describe("pre-flight failure falls through gracefully", () => {
    it("should still send command if addAgentToRoom throws", async () => {
      const { router, wsClient } = createRouter();
      const arm = createMockAgentRoomManager({
        checkAgentInRoom: false,
        availableAgents: [{ agent_id: "news-agent", agent_name: "news-agent" }],
        addAgentThrows: new Error("Network timeout")
      });
      router.setAgentRoomManager(arm);

      const promise = (router as any)._requestQuoteInternal(
        "@news-agent latest",
        "room-1",
        undefined,
        false
      );

      // Pre-flight tried, failed, but sendMessage should still be called
      await vi.waitFor(() => {
        expect(wsClient.sendMessage).toHaveBeenCalled();
      });

      resolveQuote(wsClient);
      const result = await promise;
      expect(result.agentId).toBe("news-agent");
    });
  });
});
