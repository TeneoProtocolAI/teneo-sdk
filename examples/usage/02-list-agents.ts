/**
 * Example 2: List Available Agents
 *
 * This example demonstrates:
 * - Connecting to Teneo
 * - Retrieving list of available agents
 * - Inspecting agent properties (name, description, capabilities, status)
 * - Using the agent registry
 *
 * Run: npx tsx examples/usage/02-list-agents.ts
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

async function main() {
  console.log("🚀 Example 2: List Available Agents\n");

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
    process.exit(1);
  }

  // Build and create SDK
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withLogging("info")
    .build();

  const sdk = new TeneoSDK(config);

  // Listen for agent list updates
  sdk.on("agent:list", (agents) => {
    console.log(`📋 Agent list updated: ${agents.length} agents available`);
  });

  try {
    // Connect to Teneo
    console.log("🔌 Connecting to Teneo network...");
    await sdk.connect();
    console.log("✅ Connected!\n");

    // Wait a moment for agent list to populate
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 1: Get all agents
    console.log("⚙️  Step 1: Retrieving all agents...");
    const agents = sdk.getAgents();
    console.log(`✅ Found ${agents.length} agents\n`);

    if (agents.length === 0) {
      console.log("⚠️  No agents available in the network");
      console.log("   This might be because:");
      console.log("   - No agents are registered in the room");
      console.log("   - Agents are offline");
      console.log("   - You need to wait a bit longer for the list to populate");
      return;
    }

    // Step 2: Display agent details
    console.log("📊 Agent Details:");
    console.log("=".repeat(80));

    agents.forEach((agent, index) => {
      console.log(`\n${index + 1}. ${agent.name || "Unnamed Agent"}`);
      console.log(`   ID: ${agent.id}`);
      console.log(`   Status: ${agent.status}`);

      if (agent.description) {
        console.log(`   Description: ${agent.description}`);
      }

      if (agent.room) {
        console.log(`   Room: ${agent.room}`);
      }

      if (agent.agentType) {
        console.log(`   Type: ${agent.agentType}`);
      }

      // Display capabilities
      if (agent.capabilities && agent.capabilities.length > 0) {
        console.log(`   Capabilities (${agent.capabilities.length}):`);
        agent.capabilities.forEach((cap) => {
          console.log(`      • ${cap.name}: ${cap.description}`);
        });
      }

      // Display commands
      if (agent.commands && agent.commands.length > 0) {
        console.log(`   Commands (${agent.commands.length}):`);
        agent.commands.slice(0, 3).forEach((cmd) => {
          console.log(`      • ${cmd.trigger} ${cmd.argument || ""}`);
          console.log(`        ${cmd.description}`);
        });
        if (agent.commands.length > 3) {
          console.log(`      ... and ${agent.commands.length - 3} more`);
        }
      }
    });

    console.log("\n" + "=".repeat(80));

    // Step 3: Get agent by ID
    if (agents.length > 0) {
      console.log("\n⚙️  Step 3: Retrieving specific agent by ID...");
      const firstAgent = agents[0];
      const agent = sdk.getAgent(firstAgent.id);

      if (agent) {
        console.log(`✅ Retrieved agent: ${agent.name}`);
        console.log(`   ID: ${agent.id}`);
        console.log(`   Status: ${agent.status}`);
      }
    }

    // Step 4: Summary statistics
    console.log("\n📈 Summary Statistics:");
    console.log(`   Total Agents: ${agents.length}`);

    const onlineAgents = agents.filter((a) => a.status === "online");
    console.log(`   Online: ${onlineAgents.length}`);

    const offlineAgents = agents.filter((a) => a.status === "offline");
    console.log(`   Offline: ${offlineAgents.length}`);

    const agentsWithCapabilities = agents.filter(
      (a) => a.capabilities && a.capabilities.length > 0
    );
    console.log(`   With Capabilities: ${agentsWithCapabilities.length}`);

    const agentsWithCommands = agents.filter((a) => a.commands && a.commands.length > 0);
    console.log(`   With Commands: ${agentsWithCommands.length}`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    sdk.disconnect();
    sdk.destroy();
    console.log("\n✅ Disconnected");
    console.log("🎉 Example completed!");
  }
}

main().catch(console.error);
