/**
 * Example 3: Pick and Communicate with Specific Agent
 *
 * This example demonstrates:
 * - Finding a specific agent by ID or name
 * - Sending a direct command to an agent (bypassing coordinator)
 * - Waiting for and receiving agent responses
 * - Handling response formats (raw, humanized, both)
 *
 * Run: npx tsx examples/usage/03-pick-agent.ts [agent-name-or-id]
 * Example: npx tsx examples/usage/03-pick-agent.ts "X Platform Agent"
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder, FormattedResponse } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

async function main() {
  console.log("🚀 Example 3: Pick and Communicate with Specific Agent\n");

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
    process.exit(1);
  }

  // Get agent name/ID from command line or use default
  const targetAgentName = process.argv[2];

  // Build SDK with response format set to 'both' to see raw and humanized
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withResponseFormat({ format: "both", includeMetadata: true })
    .withLogging("info")
    .build();

  const sdk = new TeneoSDK(config);

  // Listen for agent responses
  sdk.on("agent:response", (response) => {
    console.log("📨 Agent response event received:");
    console.log(`   Agent: ${response.agentName || response.agentId}`);
    console.log(`   Task ID: ${response.taskId}`);
    console.log(`   Success: ${response.success}`);
  });

  try {
    // Connect
    console.log("🔌 Connecting to Teneo network...");
    await sdk.connect();
    console.log("✅ Connected!\n");

    // Wait for agents to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 1: List available agents
    console.log("⚙️  Step 1: Getting available agents...");
    const agents = sdk.getAgents();
    console.log(`✅ Found ${agents.length} agents\n`);

    if (agents.length === 0) {
      console.log("❌ No agents available");
      return;
    }

    // Display available agents
    console.log("📋 Available Agents:");
    agents.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.name || "Unnamed"} (${agent.id})`);
      console.log(`      Status: ${agent.status}`);
      if (agent.description) {
        console.log(`      ${agent.description}`);
      }
    });
    console.log("");

    // Step 2: Pick an agent
    console.log("⚙️  Step 2: Selecting agent...");
    let selectedAgent;

    if (targetAgentName) {
      // Find by name or ID from command line
      console.log(`   Searching for: "${targetAgentName}"`);
      selectedAgent = agents.find(
        (a) =>
          a.name?.toLowerCase().includes(targetAgentName.toLowerCase()) ||
          a.id.toLowerCase() === targetAgentName.toLowerCase()
      );

      if (!selectedAgent) {
        console.log(`❌ Agent "${targetAgentName}" not found`);
        console.log("   Available agents listed above");
        return;
      }
    } else {
      // Pick first online agent
      selectedAgent =
        agents.find((a) => a.status === "online" && a.id !== "solidity-agent-v3") || agents[0];
      console.log("   No agent specified, selecting first online agent");
    }

    console.log(`✅ Selected: ${selectedAgent.name || selectedAgent.id}`);
    console.log(`   ID: ${selectedAgent.id}`);
    console.log(`   Status: ${selectedAgent.status}`);
    console.log("");

    // Step 3: Send a direct command to the agent
    console.log("⚙️  Step 3: Sending command to agent...");

    // Construct a simple command based on agent type
    let command;
    if (
      selectedAgent.name?.toLowerCase().includes("x platform") ||
      selectedAgent.name?.toLowerCase().includes("twitter")
    ) {
      command = "timeline @elonmusk 3";
      console.log(`   Command: ${command}`);
      console.log("   (Getting Twitter timeline for @elonmusk)");
    } else if (selectedAgent.commands && selectedAgent.commands.length > 0) {
      // Use first available command
      const firstCmd = selectedAgent.commands[0];
      command = `${firstCmd.trigger} ${firstCmd.argument || "test"}`;
      console.log(`   Command: ${command}`);
      console.log(`   (Using agent's first command: ${firstCmd.description})`);
    } else {
      command = "hello";
      console.log(`   Command: ${command}`);
      console.log("   (Sending simple greeting)");
    }

    console.log("   Waiting for response (timeout: 30s)...");
    console.log("");

    const startTime = Date.now();

    // Send direct command and wait for response
    const response = await sdk.sendDirectCommand(
      {
        agent: selectedAgent.id,
        command: command,
        room: DEFAULT_ROOM
      },
      true
    ); // waitForResponse = true

    if (!response) {
      console.log("❌ No response received");
      return;
    }

    const duration = Date.now() - startTime;

    // Step 4: Display the response
    console.log("✅ Response received!\n");
    console.log("📊 Response Details:");
    console.log("=".repeat(80));

    if (response.humanized) {
      console.log("\n📝 Humanized Response:");
      console.log(response.humanized);
    }

    if (response.raw) {
      console.log("\n📄 Raw Response:");
      console.log(JSON.stringify(response.raw, null, 2));
    }

    if (response.metadata) {
      console.log("\n📋 Metadata:");
      console.log(`   Task ID: ${response.metadata.taskId}`);
      console.log(`   Agent ID: ${response.metadata.agentId}`);
      console.log(`   Agent Name: ${response.metadata.agentName}`);
      console.log(`   Timestamp: ${response.metadata.timestamp}`);
      console.log(`   Duration: ${duration}ms`);
    }

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      if ("code" in error) {
        console.error("   Code:", (error as any).code);
      }
    }
    process.exit(1);
  } finally {
    sdk.disconnect();
    sdk.destroy();
    console.log("\n✅ Disconnected");
    console.log("🎉 Example completed!");
  }
}

main().catch(console.error);
