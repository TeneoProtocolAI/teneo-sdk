/**
 * Unit tests for AdminManager
 * Tests admin operations including listAllAgents with sortBy option
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminManager } from "../../../src/managers/admin-manager";
import { WebSocketClient } from "../../../src/core/websocket-client";
import { Logger } from "../../../src/types";

describe("AdminManager", () => {
  let manager: AdminManager;
  let mockWsClient: WebSocketClient;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockWsClient = {
      isConnected: true,
      sendMessage: vi.fn().mockResolvedValue(undefined)
    } as any;

    manager = new AdminManager(mockWsClient, mockLogger);
    manager.setAdminStatus(true);
  });

  describe("listAllAgents", () => {
    const mockAgentsResponse = {
      agents: [
        { agent_name: "Agent A", review_status: "public", is_banned: false },
        { agent_name: "Agent B", review_status: "private", is_banned: false }
      ],
      total: 2,
      offset: 0,
      limit: 50,
      has_more: false
    };

    it("should send sort_by when sortBy is 'a-z'", async () => {
      const listPromise = manager.listAllAgents({ sortBy: "a-z" });

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(mockAgentsResponse, call.request_id);
      }, 10);

      await listPromise;

      const sentMessage = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentMessage).toMatchObject({
        type: "list_all_agents",
        sort_by: "a-z",
        offset: 0,
        limit: 50
      });
    });

    it("should send sort_by when sortBy is 'requests'", async () => {
      const listPromise = manager.listAllAgents({ sortBy: "requests" });

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(mockAgentsResponse, call.request_id);
      }, 10);

      await listPromise;

      const sentMessage = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentMessage).toMatchObject({
        type: "list_all_agents",
        sort_by: "requests",
        offset: 0,
        limit: 50
      });
    });

    it("should not include sort_by when sortBy is undefined", async () => {
      const listPromise = manager.listAllAgents({});

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(mockAgentsResponse, call.request_id);
      }, 10);

      await listPromise;

      const sentMessage = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentMessage).not.toHaveProperty("sort_by");
      expect(sentMessage).toMatchObject({
        type: "list_all_agents",
        offset: 0,
        limit: 50
      });
    });

    it("should not include sort_by when called with no options", async () => {
      const listPromise = manager.listAllAgents();

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(mockAgentsResponse, call.request_id);
      }, 10);

      await listPromise;

      const sentMessage = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentMessage).not.toHaveProperty("sort_by");
    });

    it("should send sort_by alongside other options", async () => {
      const listPromise = manager.listAllAgents({
        filter: "test",
        offset: 10,
        limit: 25,
        sortBy: "a-z"
      });

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(
          { ...mockAgentsResponse, filter: "test", offset: 10, limit: 25 },
          call.request_id
        );
      }, 10);

      const result = await listPromise;

      const sentMessage = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentMessage).toMatchObject({
        type: "list_all_agents",
        filter: "test",
        offset: 10,
        limit: 25,
        sort_by: "a-z"
      });
      expect(result.offset).toBe(10);
      expect(result.limit).toBe(25);
      expect(result.filter).toBe("test");
    });

    it("should resolve with correct result structure", async () => {
      const listPromise = manager.listAllAgents({ sortBy: "requests" });

      setTimeout(() => {
        const call = (mockWsClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        manager.handleAllAgentsResponse(mockAgentsResponse, call.request_id);
      }, 10);

      const result = await listPromise;

      expect(result).toEqual({
        agents: mockAgentsResponse.agents,
        total: 2,
        offset: 0,
        limit: 50,
        hasMore: false,
        filter: undefined
      });
    });

    it("should reject if not connected", async () => {
      mockWsClient.isConnected = false;

      await expect(manager.listAllAgents({ sortBy: "a-z" })).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );
    });

    it("should reject if not admin", async () => {
      manager.setAdminStatus(false);

      await expect(manager.listAllAgents({ sortBy: "a-z" })).rejects.toThrow(
        "Admin privileges required"
      );
    });
  });
});
