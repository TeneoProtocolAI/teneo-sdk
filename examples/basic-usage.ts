/**
 * Basic usage example for Teneo Protocol SDK
 * Demonstrates connection, authentication, and sending messages to agents
 */

import { TeneoSDK, SDKConfigBuilder, SecurePrivateKey } from "../src";

// Load configuration from environment variables
const WS_URL =
  process.env.WS_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

async function main() {
  // Validate required configuration
  if (!PRIVATE_KEY) {
    console.error("ERROR: PRIVATE_KEY environment variable is required");
    console.error("Set it with: export PRIVATE_KEY='your-private-key'");
    process.exit(1);
  }

  // SEC-3: Encrypt private key in memory for enhanced security
  const secureKey = new SecurePrivateKey(PRIVATE_KEY);
  console.log("✓ Private key encrypted in memory (SEC-3)");

  // Build configuration using fluent API
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey, WALLET_ADDRESS) // Use encrypted key
    .withAutoJoinRooms([DEFAULT_ROOM]) // Auto-join default room on connect
    .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 }) // Enable reconnection
    .withResponseFormat({ format: "both", includeMetadata: true }) // Get both raw and humanized responses with metadata
    .withLogging("debug") // Enable debug logging
    .build();

  // Create SDK instance
  const sdk = new TeneoSDK(config);

  // Set up event listeners
  setupEventListeners(sdk);

  try {
    // Connect to Teneo network
    console.log("\n→ Connecting to Teneo network...");
    await sdk.connect();
    console.log("✓ SDK is connected and authenticated!");

    // Show current subscriptions
    const subscribed = sdk.getSubscribedRooms();
    console.log(
      `\n→ Currently subscribed to ${subscribed.length} room(s): ${subscribed.join(", ")}`
    );

    // Subscribe to additional room if available
    const rooms = sdk.getRooms();
    if (rooms.length > 1) {
      const additionalRoom = rooms.find((r) => r.id !== DEFAULT_ROOM);
      if (additionalRoom) {
        console.log(
          `\n→ Subscribing to additional room: ${additionalRoom.name || additionalRoom.id}`
        );
        await sdk.subscribeToRoom(additionalRoom.id);

        // Show updated subscriptions
        const updatedSubscriptions = sdk.getSubscribedRooms();
        console.log(`✓ Now subscribed to: ${updatedSubscriptions.join(", ")}`);
      }
    }

    // Get list of available agents
    const agents = sdk.getAgents();
    console.log(`\n→ Available agents: ${agents.length}`);
    agents.forEach((agent) => {
      console.log(`  • ${agent.name}: ${agent.description || "No description"}`);
    });

    // PERF-3: Demonstrate indexed agent lookups (O(1) complexity)
    console.log("\n→ Testing indexed agent lookups (PERF-3):");

    // Search by capability (O(1))
    const weatherAgents = sdk.findAgentsByCapability("weather-forecast");
    if (weatherAgents.length > 0) {
      console.log(`  ✓ Found ${weatherAgents.length} agent(s) with weather capability`);
    }

    // Search by name (O(k) where k = tokens)
    const searchResults = sdk.findAgentsByName("agent");
    if (searchResults.length > 0) {
      console.log(`  ✓ Found ${searchResults.length} agent(s) matching name search`);
    }

    // Search by status (O(1))
    const onlineAgents = sdk.findAgentsByStatus("online");
    console.log(`  ✓ ${onlineAgents.length} agent(s) currently online`);

    // Send message to the room
    console.log("\n→ Sending message to room...");
    const response = await sdk.sendMessage("Hello from the Teneo SDK!", {
      room: DEFAULT_ROOM,
      waitForResponse: true,
      timeout: 30000
    });

    if (response && response.humanized) {
      console.log("✓ Response received:", response.humanized.substring(0, 200));
    } else if (response) {
      console.log("✓ Response received (no humanized content)");
    }

    // Wait for some messages
    console.log("\n→ Listening for messages (press Ctrl+C to exit)...");
    console.log("  Watch the event logs above for real-time updates");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  } catch (error) {
    console.error("\n✗ Error:", error);
  } finally {
    // Clean up
    console.log("\n→ Disconnecting...");
    sdk.disconnect();
    sdk.destroy();
    console.log("✓ Cleanup complete");
  }
}

function setupEventListeners(sdk: TeneoSDK) {
  // Connection events
  sdk.on("connection:open", () => {
    console.log("[CONNECTION] Connected to WebSocket");
  });

  sdk.on("connection:close", (code, reason) => {
    console.log(`[CONNECTION] Disconnected: ${code} - ${reason}`);
  });

  sdk.on("connection:reconnecting", (attempt) => {
    console.log(`[CONNECTION] Reconnecting... (attempt ${attempt})`);
  });

  sdk.on("connection:reconnected", () => {
    console.log("[CONNECTION] Reconnected successfully");
  });

  // Authentication events
  sdk.on("auth:challenge", (challenge) => {
    console.log(`[AUTH] Authentication challenge received: ${challenge.substring(0, 10)}...`);
  });

  sdk.on("auth:success", (state) => {
    console.log(`[AUTH] Authenticated as: ${state.walletAddress}`);
    console.log(`[AUTH]    Whitelisted: ${state.isWhitelisted}`);
    console.log(`[AUTH]    Rooms: ${state.rooms?.join(", ") || "None"}`);
  });

  sdk.on("auth:error", (error) => {
    console.log(`[AUTH] Authentication failed: ${error}`);
  });

  // Agent events
  sdk.on("agent:selected", (data) => {
    console.log(`\n[AGENT] Coordinator selected: ${data.agentName}`);
    console.log(`[AGENT]    Reasoning: ${data.reasoning}`);
    if (data.command) {
      console.log(`[AGENT]    Command: ${data.command}`);
    }
  });

  sdk.on("agent:response", (response) => {
    console.log(`\n[AGENT] Response from ${response.agentName || response.agentId}:`);
    console.log(`[AGENT]    Content: ${response.humanized || response.content}`);
    if (response.error) {
      console.log(`[AGENT]    Error: ${response.error}`);
    }
  });

  sdk.on("agent:list", (agents) => {
    console.log(`\n[AGENT] Agent list updated: ${agents.length} agents`);
  });

  // Room events
  sdk.on("room:subscribed", (data) => {
    console.log(`[ROOM] Subscribed to room: ${data.roomId}`);
  });

  sdk.on("room:unsubscribed", (data) => {
    console.log(`[ROOM] Unsubscribed from room: ${data.roomId}`);
  });

  // Webhook events
  sdk.on("webhook:sent", (_payload, url) => {
    console.log(`[WEBHOOK] Webhook sent to ${url}`);
  });

  sdk.on("webhook:error", (error, url) => {
    console.log(`[WEBHOOK] Webhook error for ${url}: ${error.message}`);
  });

  // Error events
  sdk.on("error", (error) => {
    console.error(`[ERROR] SDK Error: ${error.message}`);
  });

  sdk.on("warning", (warning) => {
    console.warn(`[WARNING] ${warning}`);
  });
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}
