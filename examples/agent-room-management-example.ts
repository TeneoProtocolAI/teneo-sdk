/**
 * Agent Room Management Example
 *
 * Demonstrates how to customize which agents are available in each room using Teneo SDK v2.0.
 *
 * This example shows:
 * - Listing available agents for a room
 * - Adding specific agents to your room
 * - Listing agents currently in a room
 * - Removing agents from a room
 * - Using cache for performance
 * - Real-time agent status updates
 *
 * Prerequisites:
 * - Set TENEO_WS_URL environment variable
 * - Set PRIVATE_KEY environment variable (64 hex characters, no 0x prefix)
 * - Have at least one owned room
 *
 * Run:
 *   npx ts-node examples/agent-room-management-example.ts
 */

import { TeneoSDK } from "../src";
import * as dotenv from "dotenv";

dotenv.config();

const wsUrl = process.env.TENEO_WS_URL!;
const privateKey = process.env.PRIVATE_KEY!;

async function main() {
  console.log("🚀 Teneo SDK v2.0 - Agent Room Management Example\n");

  // Initialize SDK
  const sdk = new TeneoSDK({
    wsUrl,
    privateKey,
    logLevel: "info",
    reconnect: true
  });

  // Set up event listeners
  setupEventListeners(sdk);

  try {
    // Connect and authenticate
    console.log("📡 Connecting to Teneo Protocol...");
    await sdk.connect();
    console.log("✅ Connected and authenticated\n");

    // Wait for initial data to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 1: Get or create a test room
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏠 Setting Up Test Room");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const testRoom = await getOrCreateTestRoom(sdk);

    if (!testRoom) {
      console.log("❌ Could not get or create a test room");
      return;
    }

    console.log(`Using room: "${testRoom.name}" (${testRoom.id})\n`);

    // Step 2: List current agents in the room
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Current Agents in Room");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const currentAgents = await sdk.listRoomAgents(testRoom.id, false); // Force fresh data
    displayAgents(currentAgents, "room");

    // Step 3: List available agents (not yet in room)
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🆕 Available Agents (Not in Room)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const availableAgents = await sdk.listAvailableAgents(testRoom.id, false);
    displayAgents(availableAgents, "available");

    // Step 4: Add agents to the room
    if (availableAgents.length > 0) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("➕ Adding Agents to Room");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      await addAgentsToRoom(sdk, testRoom.id, availableAgents);

      // Wait for additions to process
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Step 5: List updated room agents (using cache this time)
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Updated Room Agents (from cache)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const updatedAgents = await sdk.listRoomAgents(testRoom.id, true); // Use cache
    displayAgents(updatedAgents, "room");

    // Step 6: Demonstrate synchronous query methods
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚡ Instant Cache Queries (No Network Call)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    demonstrateCacheQueries(sdk, testRoom.id, updatedAgents);

    // Step 7: Remove agents from the room
    if (updatedAgents.length > 0) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("➖ Removing Agents from Room");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      await removeAgentsFromRoom(sdk, testRoom.id, updatedAgents);

      // Wait for removals to process
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Step 8: Final room status
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Final Room Status");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const finalAgents = await sdk.listRoomAgents(testRoom.id, false);
    displayAgents(finalAgents, "room");

    // Step 9: Demonstrate cache invalidation
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔄 Cache Management");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Cache is automatically invalidated when:");
    console.log("  ✓ You add an agent to the room");
    console.log("  ✓ You remove an agent from the room");
    console.log("  ✓ An agent's status changes");
    console.log("  ✓ Cache TTL expires (5 minutes)");
    console.log("\nManual cache invalidation:");
    sdk.invalidateAgentRoomCache(testRoom.id);
    console.log(`  ✅ Cache cleared for room ${testRoom.id}`);

    console.log("\n✅ Agent room management example completed!");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    // Disconnect
    console.log("\n👋 Disconnecting...");
    sdk.disconnect();
    console.log("✅ Disconnected");
  }
}

function setupEventListeners(sdk: TeneoSDK) {
  // Agent added
  sdk.on("agent_room:agent_added", (roomId, agentId) => {
    console.log(`  ✅ Agent ${agentId} added to room ${roomId}`);
  });

  // Agent removed
  sdk.on("agent_room:agent_removed", (roomId, agentId) => {
    console.log(`  ✅ Agent ${agentId} removed from room ${roomId}`);
  });

  // Agents listed
  sdk.on("agent_room:agents_listed", (roomId, agents) => {
    console.log(`  📋 Listed ${agents.length} agents in room ${roomId}`);
  });

  // Available agents listed
  sdk.on("agent_room:available_agents_listed", (agents) => {
    console.log(`  📋 Listed ${agents.length} available agents`);
  });

  // Status updates (real-time)
  sdk.on("agent_room:status_update", (data) => {
    console.log(`  🔄 Agent ${data.agentId} status updated in room ${data.roomId}`);
    console.log(`     New status: ${data.status}`);
  });

  // Error events
  sdk.on("agent_room:add_error", (error, roomId) => {
    console.error(`  ❌ Failed to add agent to room ${roomId}: ${error.message}`);
  });

  sdk.on("agent_room:remove_error", (error, roomId) => {
    console.error(`  ❌ Failed to remove agent from room ${roomId}: ${error.message}`);
  });

  sdk.on("agent_room:list_error", (error, roomId) => {
    console.error(`  ❌ Failed to list agents in room ${roomId}: ${error.message}`);
  });
}

async function getOrCreateTestRoom(sdk: TeneoSDK) {
  // Try to get an existing owned room
  const ownedRooms = sdk.getOwnedRooms();

  if (ownedRooms.length > 0) {
    console.log(`Found ${ownedRooms.length} existing owned room(s)`);
    console.log(`Using first room: "${ownedRooms[0].name}"`);
    return ownedRooms[0];
  }

  // Create a new test room
  console.log("No owned rooms found. Creating test room...");

  if (!sdk.canCreateRoom()) {
    console.log("⚠️  Cannot create room - limit reached");
    console.log(`   Current: ${sdk.getOwnedRoomCount()}/${sdk.getRoomLimit()}`);
    return null;
  }

  try {
    const room = await sdk.createRoom({
      name: "Agent Test Room",
      description: "Room for testing agent customization (SDK v2.0 example)"
    });
    console.log(`✅ Created test room: ${room.id}`);
    return room;
  } catch (error: any) {
    console.error(`Failed to create test room: ${error.message}`);
    return null;
  }
}

function displayAgents(agents: any[], type: "room" | "available") {
  if (agents.length === 0) {
    console.log(`  (No ${type === "room" ? "agents in room" : "available agents"})`);
    return;
  }

  console.log(`Found ${agents.length} agent(s):\n`);

  agents.forEach((agent, i) => {
    console.log(`${i + 1}. ${agent.agent_name || "Unnamed Agent"}`);
    console.log(`   ID: ${agent.agent_id}`);

    if (agent.description) {
      console.log(`   Description: ${agent.description}`);
    }

    if (agent.status) {
      console.log(`   Status: ${agent.status}`);
    }

    if (agent.capabilities && agent.capabilities.length > 0) {
      const capNames = agent.capabilities.map((c: any) => c.name).join(", ");
      console.log(`   Capabilities: ${capNames}`);
    }

    if (agent.commands && agent.commands.length > 0) {
      const cmdTriggers = agent.commands.map((c: any) => `/${c.trigger}`).join(", ");
      console.log(`   Commands: ${cmdTriggers}`);
    }

    if (agent.image) {
      console.log(`   Image: ${agent.image.substring(0, 50)}...`);
    }

    if (agent.added_at) {
      console.log(`   Added at: ${agent.added_at}`);
    }

    if (agent.added_by) {
      console.log(`   Added by: ${agent.added_by}`);
    }

    console.log();
  });
}

async function addAgentsToRoom(sdk: TeneoSDK, roomId: string, availableAgents: any[]) {
  // Add up to 2 agents from the available list
  const agentsToAdd = availableAgents.slice(0, 2);

  console.log(`Adding ${agentsToAdd.length} agent(s) to the room...\n`);

  for (const agent of agentsToAdd) {
    try {
      console.log(`Adding "${agent.agent_name}" (${agent.agent_id})...`);
      await sdk.addAgentToRoom(roomId, agent.agent_id);
      // Wait a bit between additions
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error: any) {
      console.error(`Failed to add agent ${agent.agent_id}: ${error.message}`);
    }
  }
}

async function removeAgentsFromRoom(sdk: TeneoSDK, roomId: string, roomAgents: any[]) {
  // Remove up to 2 agents
  const agentsToRemove = roomAgents.slice(0, 2);

  console.log(`Removing ${agentsToRemove.length} agent(s) from the room...\n`);

  for (const agent of agentsToRemove) {
    try {
      console.log(`Removing "${agent.agent_name}" (${agent.agent_id})...`);
      await sdk.removeAgentFromRoom(roomId, agent.agent_id);
      // Wait a bit between removals
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error: any) {
      console.error(`Failed to remove agent ${agent.agent_id}: ${error.message}`);
    }
  }
}

function demonstrateCacheQueries(sdk: TeneoSDK, roomId: string, agents: any[]) {
  // Get agent count (instant, from cache)
  const count = sdk.getRoomAgentCount(roomId);
  console.log(`Room agent count: ${count}`);

  // Get cached agents (instant)
  const cachedAgents = sdk.getRoomAgents(roomId);
  if (cachedAgents) {
    const names = cachedAgents.map((a) => a.agent_name || "Unnamed").join(", ");
    console.log(`Cached agents: ${names}`);
  }

  // Check if specific agent is in room (instant)
  if (agents.length > 0) {
    const firstAgent = agents[0];
    const isInRoom = sdk.isAgentInRoom(roomId, firstAgent.agent_id);
    console.log(
      `Is "${firstAgent.agent_name}" in room? ${isInRoom === true ? "✅ Yes" : isInRoom === false ? "❌ No" : "❓ Unknown (no cache)"}`
    );
  }

  // Get cached available agents (instant)
  const cachedAvailable = sdk.getAvailableAgents(roomId);
  if (cachedAvailable) {
    console.log(`Cached available agents: ${cachedAvailable.length}`);
  }

  console.log("\n💡 These queries are instant - no network calls!");
  console.log("   Cache is automatically maintained and invalidated as needed.");
}

// Run the example
main().catch(console.error);
