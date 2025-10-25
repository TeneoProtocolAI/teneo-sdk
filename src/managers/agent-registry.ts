/**
 * AgentRegistry - Manages agent state and lookup
 * Handles agent caching and queries
 */

import { EventEmitter } from "eventemitter3";
import { Agent, Logger } from "../types";
import { SDKEvents } from "../types/events";
import { AgentIdSchema, SearchQuerySchema } from "../types/validation";

export class AgentRegistry extends EventEmitter<SDKEvents> {
  private readonly logger: Logger;
  private readonly agents = new Map<string, Agent>();
  private cachedAgents?: Readonly<Agent>[];
  private isAgentsCacheDirty = true;

  // PERF-3: Search indices for O(1) lookups
  private capabilityIndex = new Map<string, Set<string>>();
  private nameTokenIndex = new Map<string, Set<string>>();
  private statusIndex = new Map<string, Set<string>>();

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Gets a cached list of all available agents in the network.
   * Uses lazy caching with dirty flag for optimal performance.
   * Returns a read-only array with defensive copies to prevent external modification.
   *
   * @returns Read-only array of agent copies
   *
   * @example
   * ```typescript
   * const agents = agentRegistry.getAgents();
   * console.log(`${agents.length} agents available`);
   * agents.forEach(agent => console.log(agent.name));
   * ```
   */
  public getAgents(): ReadonlyArray<Readonly<Agent>> {
    if (this.isAgentsCacheDirty || !this.cachedAgents) {
      this.rebuildCache();
    }
    return this.cachedAgents!.map((agent) => ({ ...agent }));
  }

  /**
   * Gets a specific agent by its unique identifier.
   * Performs O(1) lookup using internal Map structure.
   * Returns a defensive copy to prevent external modification of agent state.
   *
   * @param agentId - The unique identifier of the agent
   * @returns Copy of the agent object if found, undefined otherwise
   * @throws {ValidationError} If agentId is invalid
   *
   * @example
   * ```typescript
   * const agent = agentRegistry.getAgent('weather-agent-001');
   * if (agent) {
   *   console.log(`Found: ${agent.name}`);
   *   console.log(`Capabilities: ${agent.capabilities?.length}`);
   * }
   * ```
   */
  public getAgent(agentId: string): Readonly<Agent> | undefined {
    // Validate agent ID
    const validatedAgentId = AgentIdSchema.parse(agentId);

    const agent = this.agents.get(validatedAgentId);
    return agent ? { ...agent } : undefined;
  }

  /**
   * Finds all agents that have a specific capability.
   * PERF-3: Uses O(1) capability index lookup instead of O(n) filtering.
   *
   * @param capabilityName - The name of the capability to search for (case-insensitive)
   * @returns Read-only array of agents with the specified capability
   * @throws {ValidationError} If capabilityName is invalid
   *
   * @example
   * ```typescript
   * const weatherAgents = agentRegistry.findByCapability('weather-forecast');
   * console.log(`Found ${weatherAgents.length} agents with weather-forecast capability`);
   * ```
   */
  public findByCapability(capabilityName: string): ReadonlyArray<Agent> {
    // Validate capability name
    const validatedCapabilityName = SearchQuerySchema.parse(capabilityName);

    // Ensure cache is up to date
    if (this.isAgentsCacheDirty || !this.cachedAgents) {
      this.rebuildCache();
    }

    // O(1) index lookup instead of O(n) filter
    const normalizedCapName = validatedCapabilityName.toLowerCase();
    const agentIds = this.capabilityIndex.get(normalizedCapName);

    if (!agentIds || agentIds.size === 0) {
      return [];
    }

    // Map agent IDs to agent objects with defensive copies
    return Array.from(agentIds)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is Agent => agent !== undefined)
      .map((agent) => ({ ...agent }));
  }

  /**
   * Finds agents by name using case-insensitive partial matching.
   * PERF-3: Uses O(k) token index lookups instead of O(n) substring search,
   * where k is the number of tokens in the search query.
   *
   * @param name - The name or partial name to search for (case-insensitive)
   * @returns Read-only array of agents matching the name search
   * @throws {ValidationError} If name is invalid
   *
   * @example
   * ```typescript
   * // Find all agents with "weather" in their name
   * const weatherAgents = agentRegistry.findByName('weather');
   * weatherAgents.forEach(agent => console.log(agent.name));
   * ```
   */
  public findByName(name: string): ReadonlyArray<Agent> {
    // Validate name
    const validatedName = SearchQuerySchema.parse(name);

    // Ensure cache is up to date
    if (this.isAgentsCacheDirty || !this.cachedAgents) {
      this.rebuildCache();
    }

    // Tokenize search query
    const searchTokens = this.tokenizeString(validatedName);

    if (searchTokens.length === 0) {
      return [];
    }

    // Find agents that match ANY token (union)
    const matchingAgentIds = new Set<string>();

    for (const token of searchTokens) {
      const agentIds = this.nameTokenIndex.get(token);
      if (agentIds) {
        agentIds.forEach((id) => matchingAgentIds.add(id));
      }
    }

    if (matchingAgentIds.size === 0) {
      return [];
    }

    // Map agent IDs to agent objects with defensive copies
    return Array.from(matchingAgentIds)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is Agent => agent !== undefined)
      .map((agent) => ({ ...agent }));
  }

  /**
   * Finds all agents with a specific status.
   * PERF-3: Uses O(1) status index lookup instead of O(n) filtering.
   *
   * @param status - The status to search for: 'online' or 'offline' (case-insensitive)
   * @returns Read-only array of agents with the specified status
   * @throws {ValidationError} If status is invalid
   *
   * @example
   * ```typescript
   * const onlineAgents = agentRegistry.findByStatus('online');
   * console.log(`Found ${onlineAgents.length} online agents`);
   * ```
   */
  public findByStatus(status: string): ReadonlyArray<Agent> {
    // Validate status
    const validatedStatus = SearchQuerySchema.parse(status);

    // Ensure cache is up to date
    if (this.isAgentsCacheDirty || !this.cachedAgents) {
      this.rebuildCache();
    }

    // O(1) index lookup instead of O(n) filter
    const normalizedStatus = validatedStatus.toLowerCase();
    const agentIds = this.statusIndex.get(normalizedStatus);

    if (!agentIds || agentIds.size === 0) {
      return [];
    }

    // Map agent IDs to agent objects with defensive copies
    return Array.from(agentIds)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is Agent => agent !== undefined)
      .map((agent) => ({ ...agent }));
  }

  /**
   * Updates the registry with a new list of agents.
   * Merges with existing agents and marks cache as dirty.
   * Emits 'agent:list' event with the new agents.
   *
   * @internal This method is for internal SDK use
   * @param agents - Array of agents to add or update in the registry
   *
   * @example
   * ```typescript
   * // Internal SDK usage
   * agentRegistry.updateAgents(newAgentList);
   * ```
   */
  public updateAgents(agents: Agent[]): void {
    this.logger.debug("AgentRegistry: Updating agents", { count: agents.length });

    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }

    this.isAgentsCacheDirty = true;
    this.emit("agent:list", agents);
  }

  /**
   * Updates a single agent in the registry.
   * Adds new agent or updates existing one, then marks cache as dirty.
   *
   * @internal This method is for internal SDK use
   * @param agent - The agent to add or update
   *
   * @example
   * ```typescript
   * // Internal SDK usage
   * agentRegistry.updateAgent(updatedAgent);
   * ```
   */
  public updateAgent(agent: Agent): void {
    this.logger.debug("AgentRegistry: Updating agent", { id: agent.id, name: agent.name });
    this.agents.set(agent.id, agent);
    this.isAgentsCacheDirty = true;
  }

  /**
   * Clears all agents from the registry.
   * Removes all cached agents and marks cache as dirty.
   *
   * @example
   * ```typescript
   * agentRegistry.clear();
   * console.log('All agents cleared');
   * ```
   */
  public clear(): void {
    this.agents.clear();
    this.isAgentsCacheDirty = true;
  }

  /**
   * Destroys the agent registry and cleans up resources.
   * Clears all agents and removes all event listeners.
   * After destruction, the registry cannot be reused.
   *
   * @example
   * ```typescript
   * agentRegistry.destroy();
   * console.log('Agent registry destroyed');
   * ```
   */
  public destroy(): void {
    this.logger.info("AgentRegistry: Destroying");
    this.clear();
    this.removeAllListeners();
  }

  /**
   * Rebuilds the agent cache and all search indices.
   * This is called automatically when the cache becomes dirty.
   * PERF-3: Builds capability, name token, and status indices for O(1) lookups.
   *
   * @private
   */
  private rebuildCache(): void {
    // Rebuild agent array
    this.cachedAgents = Array.from(this.agents.values()).map((agent) => ({ ...agent }));

    // Clear indices
    this.capabilityIndex.clear();
    this.nameTokenIndex.clear();
    this.statusIndex.clear();

    // Populate indices
    for (const agent of this.agents.values()) {
      // Index capabilities
      if (agent.capabilities) {
        for (const capability of agent.capabilities) {
          const capName = capability.name.toLowerCase();
          if (!this.capabilityIndex.has(capName)) {
            this.capabilityIndex.set(capName, new Set());
          }
          this.capabilityIndex.get(capName)!.add(agent.id);
        }
      }

      // Index name tokens (for partial matching)
      const nameTokens = this.tokenizeString(agent.name);
      for (const token of nameTokens) {
        if (!this.nameTokenIndex.has(token)) {
          this.nameTokenIndex.set(token, new Set());
        }
        this.nameTokenIndex.get(token)!.add(agent.id);
      }

      // Index status
      const status = agent.status.toLowerCase();
      if (!this.statusIndex.has(status)) {
        this.statusIndex.set(status, new Set());
      }
      this.statusIndex.get(status)!.add(agent.id);
    }

    this.isAgentsCacheDirty = false;
  }

  /**
   * Tokenizes a string into searchable tokens.
   * Splits on whitespace and special characters, converts to lowercase.
   *
   * @param str - String to tokenize
   * @returns Array of lowercase tokens
   * @private
   *
   * @example
   * ```typescript
   * tokenizeString("Weather API v2.0") => ["weather", "api", "v2", "0"]
   * ```
   */
  private tokenizeString(str: string): string[] {
    return str
      .toLowerCase()
      .split(/[\s\-_.,;:()[\]{}]+/)
      .filter((token) => token.length > 0);
  }
}
