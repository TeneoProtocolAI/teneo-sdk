/**
 * Tests for AgentRegistry - Focus on PERF-3 indexed lookup optimizations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRegistry } from "./agent-registry";
import { Agent, Logger } from "../types";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    registry = new AgentRegistry(mockLogger);
  });

  // Helper to create test agents
  const createAgent = (
    id: string,
    name: string,
    capabilityNames: string[] = [],
    status: "online" | "offline" = "online"
  ): Agent => ({
    id,
    name,
    status,
    capabilities: capabilityNames.map((cap) => ({
      name: cap,
      description: `Capability: ${cap}`
    }))
  });

  describe("getAgents", () => {
    it("should return empty array when no agents", () => {
      const agents = registry.getAgents();
      expect(agents).toEqual([]);
    });

    it("should return all agents", () => {
      const agent1 = createAgent("agent-1", "Weather Agent", ["weather", "forecast"]);
      const agent2 = createAgent("agent-2", "News Agent", ["news"]);

      registry.updateAgents([agent1, agent2]);

      const agents = registry.getAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe("agent-1");
      expect(agents[1].id).toBe("agent-2");
    });

    it("should return defensive copies to prevent mutation", () => {
      const agent = createAgent("agent-1", "Test Agent");
      registry.updateAgents([agent]);

      const agents = registry.getAgents();
      const firstAgent = agents[0] as any;

      // Mutate returned object
      firstAgent.name = "Modified";

      // Original should be unchanged
      const agents2 = registry.getAgents();
      expect(agents2[0].name).toBe("Test Agent");
    });

    it("should use cached array on subsequent calls", () => {
      const agent = createAgent("agent-1", "Test Agent");
      registry.updateAgents([agent]);

      const agents1 = registry.getAgents();
      const agents2 = registry.getAgents();

      // Should be different array instances but same content
      expect(agents1).not.toBe(agents2); // Different refs due to defensive copying
      expect(agents1[0].id).toBe(agents2[0].id);
    });

    it("should rebuild cache when agents are updated", () => {
      const agent1 = createAgent("agent-1", "Agent 1");
      registry.updateAgents([agent1]);

      const agents1 = registry.getAgents();
      expect(agents1).toHaveLength(1);

      const agent2 = createAgent("agent-2", "Agent 2");
      registry.updateAgent(agent2);

      const agents2 = registry.getAgents();
      expect(agents2).toHaveLength(2);
    });
  });

  describe("getAgent", () => {
    it("should return agent by ID", () => {
      const agent = createAgent("agent-1", "Test Agent");
      registry.updateAgents([agent]);

      const result = registry.getAgent("agent-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Test Agent");
    });

    it("should return undefined for non-existent agent", () => {
      const result = registry.getAgent("non-existent");
      expect(result).toBeUndefined();
    });

    it("should return defensive copy", () => {
      const agent = createAgent("agent-1", "Test Agent");
      registry.updateAgents([agent]);

      const result = registry.getAgent("agent-1") as any;
      result.name = "Modified";

      const result2 = registry.getAgent("agent-1");
      expect(result2!.name).toBe("Test Agent");
    });
  });

  describe("findByCapability - PERF-3 indexed lookup", () => {
    beforeEach(() => {
      const agents = [
        createAgent("agent-1", "Weather Agent", ["weather", "forecast"]),
        createAgent("agent-2", "News Agent", ["news", "headlines"]),
        createAgent("agent-3", "Weather API", ["weather", "api"]),
        createAgent("agent-4", "Sports Agent", ["sports"])
      ];
      registry.updateAgents(agents);
    });

    it("should find agents by capability (case-insensitive)", () => {
      const weatherAgents = registry.findByCapability("weather");
      expect(weatherAgents).toHaveLength(2);
      expect(weatherAgents.map((a) => a.id)).toContain("agent-1");
      expect(weatherAgents.map((a) => a.id)).toContain("agent-3");
    });

    it("should find agents by capability (uppercase)", () => {
      const weatherAgents = registry.findByCapability("WEATHER");
      expect(weatherAgents).toHaveLength(2);
    });

    it("should return empty array for non-existent capability", () => {
      const agents = registry.findByCapability("non-existent");
      expect(agents).toEqual([]);
    });

    it("should find agents with specific capability", () => {
      const forecastAgents = registry.findByCapability("forecast");
      expect(forecastAgents).toHaveLength(1);
      expect(forecastAgents[0].id).toBe("agent-1");
    });

    it("should return defensive copies", () => {
      const agents = registry.findByCapability("weather") as any[];
      agents[0].name = "Modified";

      const agents2 = registry.findByCapability("weather");
      expect(agents2[0].name).not.toBe("Modified");
    });

    it("should work with 100+ agents (performance test)", () => {
      // Create 100 agents with various capabilities
      const largeAgentSet: Agent[] = [];
      for (let i = 0; i < 100; i++) {
        const caps =
          i % 10 === 0
            ? ["rare-capability"]
            : i % 3 === 0
              ? ["common-capability-1", "common-capability-2"]
              : ["common-capability-1"];
        largeAgentSet.push(createAgent(`agent-${i}`, `Agent ${i}`, caps));
      }
      registry.updateAgents(largeAgentSet);

      const start = Date.now();
      const rareAgents = registry.findByCapability("rare-capability");
      const duration = Date.now() - start;

      expect(rareAgents).toHaveLength(10);
      // Should be nearly instant with index (< 5ms)
      expect(duration).toBeLessThan(5);
    });
  });

  describe("findByName - PERF-3 token-based indexed lookup", () => {
    beforeEach(() => {
      const agents = [
        createAgent("agent-1", "Weather Agent"),
        createAgent("agent-2", "Weather API"),
        createAgent("agent-3", "News Agent"),
        createAgent("agent-4", "Sports Weather Agent"),
        createAgent("agent-5", "API Gateway")
      ];
      registry.updateAgents(agents);
    });

    it("should find agents by single token", () => {
      const weatherAgents = registry.findByName("weather");
      expect(weatherAgents).toHaveLength(3);
      expect(weatherAgents.map((a) => a.id)).toContain("agent-1");
      expect(weatherAgents.map((a) => a.id)).toContain("agent-2");
      expect(weatherAgents.map((a) => a.id)).toContain("agent-4");
    });

    it("should find agents by single token (case-insensitive)", () => {
      const weatherAgents = registry.findByName("WEATHER");
      expect(weatherAgents).toHaveLength(3);
    });

    it("should find agents by partial match", () => {
      const apiAgents = registry.findByName("api");
      expect(apiAgents).toHaveLength(2);
      expect(apiAgents.map((a) => a.id)).toContain("agent-2");
      expect(apiAgents.map((a) => a.id)).toContain("agent-5");
    });

    it("should find agents by multiple tokens (union)", () => {
      const agents = registry.findByName("weather api");
      // Should return all agents with "weather" OR "api"
      expect(agents).toHaveLength(4); // agent-1, agent-2, agent-4, agent-5
    });

    it("should return empty array for non-matching name", () => {
      const agents = registry.findByName("nonexistent");
      expect(agents).toEqual([]);
    });

    it("should handle special characters in tokenization", () => {
      const agent = createAgent("agent-6", "Weather-API_v2.0");
      registry.updateAgent(agent);

      const apiAgents = registry.findByName("api");
      expect(apiAgents.some((a) => a.id === "agent-6")).toBe(true);

      const v2Agents = registry.findByName("v2");
      expect(v2Agents.some((a) => a.id === "agent-6")).toBe(true);
    });

    it("should return defensive copies", () => {
      const agents = registry.findByName("weather") as any[];
      agents[0].name = "Modified";

      const agents2 = registry.findByName("weather");
      expect(agents2[0].name).not.toBe("Modified");
    });

    it("should work with 100+ agents (performance test)", () => {
      const largeAgentSet: Agent[] = [];
      for (let i = 0; i < 100; i++) {
        const name =
          i % 10 === 0
            ? `Rare Agent ${i}`
            : i % 3 === 0
              ? `Common Weather Agent ${i}`
              : `Common Agent ${i}`;
        largeAgentSet.push(createAgent(`agent-${i}`, name));
      }
      registry.updateAgents(largeAgentSet);

      const start = Date.now();
      const rareAgents = registry.findByName("rare");
      const duration = Date.now() - start;

      expect(rareAgents).toHaveLength(10);
      // Should be nearly instant with index (< 5ms)
      expect(duration).toBeLessThan(5);
    });
  });

  describe("findByStatus - PERF-3 indexed lookup", () => {
    beforeEach(() => {
      const agents = [
        createAgent("agent-1", "Agent 1", [], "online"),
        createAgent("agent-2", "Agent 2", [], "offline"),
        createAgent("agent-3", "Agent 3", [], "online"),
        createAgent("agent-4", "Agent 4", [], "offline"),
        createAgent("agent-5", "Agent 5", [], "online")
      ];
      registry.updateAgents(agents);
    });

    it("should find online agents", () => {
      const onlineAgents = registry.findByStatus("online");
      expect(onlineAgents).toHaveLength(3);
      expect(onlineAgents.map((a) => a.id)).toContain("agent-1");
      expect(onlineAgents.map((a) => a.id)).toContain("agent-3");
      expect(onlineAgents.map((a) => a.id)).toContain("agent-5");
    });

    it("should find offline agents", () => {
      const offlineAgents = registry.findByStatus("offline");
      expect(offlineAgents).toHaveLength(2);
      expect(offlineAgents.map((a) => a.id)).toContain("agent-2");
      expect(offlineAgents.map((a) => a.id)).toContain("agent-4");
    });

    it("should be case-insensitive", () => {
      const onlineAgents = registry.findByStatus("ONLINE");
      expect(onlineAgents).toHaveLength(3);
    });

    it("should return empty array for invalid status", () => {
      const agents = registry.findByStatus("unknown");
      expect(agents).toEqual([]);
    });

    it("should return defensive copies", () => {
      const agents = registry.findByStatus("online") as any[];
      agents[0].name = "Modified";

      const agents2 = registry.findByStatus("online");
      expect(agents2[0].name).not.toBe("Modified");
    });

    it("should update when agent status changes", () => {
      let onlineAgents = registry.findByStatus("online");
      expect(onlineAgents).toHaveLength(3);

      // Update agent-1 to offline
      const updatedAgent = createAgent("agent-1", "Agent 1", [], "offline");
      registry.updateAgent(updatedAgent);

      onlineAgents = registry.findByStatus("online");
      expect(onlineAgents).toHaveLength(2);

      const offlineAgents = registry.findByStatus("offline");
      expect(offlineAgents).toHaveLength(3);
    });
  });

  describe("updateAgents", () => {
    it("should add new agents", () => {
      const agents = [createAgent("agent-1", "Agent 1"), createAgent("agent-2", "Agent 2")];
      registry.updateAgents(agents);

      expect(registry.getAgents()).toHaveLength(2);
    });

    it("should emit agent:list event", () => {
      const emitSpy = vi.spyOn(registry, "emit");
      const agents = [createAgent("agent-1", "Agent 1")];

      registry.updateAgents(agents);

      expect(emitSpy).toHaveBeenCalledWith("agent:list", agents);
    });

    it("should mark cache as dirty", () => {
      const agent1 = createAgent("agent-1", "Agent 1");
      registry.updateAgents([agent1]);

      const agents1 = registry.getAgents();

      const agent2 = createAgent("agent-2", "Agent 2");
      registry.updateAgents([agent2]);

      const agents2 = registry.getAgents();

      // Cache should have been rebuilt
      expect(agents2).toHaveLength(2);
    });
  });

  describe("updateAgent", () => {
    it("should update existing agent", () => {
      const agent = createAgent("agent-1", "Original Name");
      registry.updateAgents([agent]);

      const updatedAgent = createAgent("agent-1", "New Name");
      registry.updateAgent(updatedAgent);

      const result = registry.getAgent("agent-1");
      expect(result!.name).toBe("New Name");
    });

    it("should add new agent if not exists", () => {
      const agent = createAgent("agent-1", "Agent 1");
      registry.updateAgent(agent);

      expect(registry.getAgents()).toHaveLength(1);
    });

    it("should mark cache as dirty", () => {
      const agent = createAgent("agent-1", "Agent 1");
      registry.updateAgent(agent);

      const agents = registry.getAgents();
      expect(agents).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should remove all agents", () => {
      const agents = [createAgent("agent-1", "Agent 1"), createAgent("agent-2", "Agent 2")];
      registry.updateAgents(agents);

      registry.clear();

      expect(registry.getAgents()).toEqual([]);
    });

    it("should clear all indices", () => {
      const agent = createAgent("agent-1", "Test Agent", ["weather"]);
      registry.updateAgents([agent]);

      registry.clear();

      expect(registry.findByCapability("weather")).toEqual([]);
      expect(registry.findByName("test")).toEqual([]);
      expect(registry.findByStatus("online")).toEqual([]);
    });
  });

  describe("destroy", () => {
    it("should clear all agents", () => {
      const agents = [createAgent("agent-1", "Agent 1")];
      registry.updateAgents(agents);

      registry.destroy();

      expect(registry.getAgents()).toEqual([]);
    });

    it("should remove all event listeners", () => {
      const handler = vi.fn();
      registry.on("agent:list", handler);

      registry.destroy();

      registry.updateAgents([createAgent("agent-1", "Agent 1")]);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Cache consistency", () => {
    it("should keep indices in sync with agent updates", () => {
      const agent1 = createAgent("agent-1", "Weather Agent", ["weather"], "online");
      registry.updateAgents([agent1]);

      // Initial state
      expect(registry.findByCapability("weather")).toHaveLength(1);
      expect(registry.findByName("weather")).toHaveLength(1);
      expect(registry.findByStatus("online")).toHaveLength(1);

      // Update agent
      const agent2 = createAgent("agent-1", "News Agent", ["news"], "offline");
      registry.updateAgent(agent2);

      // Indices should be updated
      expect(registry.findByCapability("weather")).toHaveLength(0);
      expect(registry.findByCapability("news")).toHaveLength(1);
      expect(registry.findByName("weather")).toHaveLength(0);
      expect(registry.findByName("news")).toHaveLength(1);
      expect(registry.findByStatus("online")).toHaveLength(0);
      expect(registry.findByStatus("offline")).toHaveLength(1);
    });
  });
});
