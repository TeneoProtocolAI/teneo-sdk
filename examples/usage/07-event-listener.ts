/**
 * Example 7: Event Listener
 *
 * This example demonstrates:
 * - Listening to all 30+ SDK events
 * - Event-driven architecture patterns
 * - Real-time monitoring and logging
 * - Event filtering and processing
 * - Building reactive applications
 *
 * Run: npx tsx examples/usage/07-event-listener.ts
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

// Event counters for statistics
const eventStats = {
  connection: 0,
  auth: 0,
  message: 0,
  agent: 0,
  room: 0,
  webhook: 0,
  signature: 0,
  error: 0,
  other: 0
};

function categorizeEvent(eventName: string): keyof typeof eventStats {
  if (eventName.startsWith("connection:")) return "connection";
  if (eventName.startsWith("auth:")) return "auth";
  if (eventName.startsWith("message:")) return "message";
  if (eventName.startsWith("agent:")) return "agent";
  if (eventName.startsWith("room:")) return "room";
  if (eventName.startsWith("webhook:")) return "webhook";
  if (eventName.startsWith("signature:")) return "signature";
  if (eventName === "error" || eventName === "warning") return "error";
  return "other";
}

async function main() {
  console.log("🚀 Example 7: Event Listener\n");
  console.log("This example listens to all SDK events and displays them in real-time.\n");

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
    process.exit(1);
  }

  // Build SDK
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withResponseFormat({ format: "both", includeMetadata: true })
    .withLogging("info")
    .build();

  const sdk = new TeneoSDK(config);

  // ============================================================================
  // CONNECTION EVENTS
  // ============================================================================

  sdk.on("connection:open", () => {
    eventStats.connection++;
    console.log("🔌 [CONNECTION] WebSocket connection opened");
  });

  sdk.on("connection:close", (code, reason) => {
    eventStats.connection++;
    console.log(`🔌 [CONNECTION] Connection closed: ${code} - ${reason}`);
  });

  sdk.on("connection:error", (error) => {
    eventStats.connection++;
    console.error("🔌 [CONNECTION] Connection error:", error.message);
  });

  sdk.on("connection:reconnecting", (attempt) => {
    eventStats.connection++;
    console.log(`🔌 [CONNECTION] Reconnecting... (attempt ${attempt})`);
  });

  sdk.on("connection:reconnected", () => {
    eventStats.connection++;
    console.log("🔌 [CONNECTION] Reconnected successfully!");
  });

  sdk.on("connection:state", (state) => {
    eventStats.connection++;
    console.log("🔌 [CONNECTION] State changed:", {
      connected: state.connected,
      authenticated: state.authenticated,
      reconnecting: state.reconnecting
    });
  });

  // ============================================================================
  // AUTHENTICATION EVENTS
  // ============================================================================

  sdk.on("auth:challenge", (challenge) => {
    eventStats.auth++;
    console.log(`🔐 [AUTH] Challenge received: ${challenge.substring(0, 20)}...`);
  });

  sdk.on("auth:success", (state) => {
    eventStats.auth++;
    console.log("🔐 [AUTH] ✅ Authentication successful!");
    console.log(`       Wallet: ${state.walletAddress}`);
    console.log(`       Whitelisted: ${state.isWhitelisted}`);
    console.log(`       Admin: ${state.isAdmin}`);
    console.log(`       NFT Verified: ${state.nftVerified}`);
    console.log(`       Rooms: ${state.rooms?.length || 0}`);
  });

  sdk.on("auth:error", (error) => {
    eventStats.auth++;
    console.error("🔐 [AUTH] ❌ Authentication failed:", error);
  });

  sdk.on("auth:state", (state) => {
    eventStats.auth++;
    console.log("🔐 [AUTH] State changed:", {
      authenticated: state.authenticated,
      wallet: state.walletAddress
    });
  });

  // ============================================================================
  // AGENT EVENTS
  // ============================================================================

  sdk.on("agent:selected", (data) => {
    eventStats.agent++;
    console.log("🤖 [AGENT] Agent selected by coordinator:");
    console.log(`       Agent: ${data.agentName} (${data.agentId})`);
    console.log(`       Reasoning: ${data.reasoning}`);
    if (data.command) {
      console.log(`       Command: ${data.command}`);
    }
  });

  sdk.on("agent:response", (response) => {
    eventStats.agent++;
    console.log("🤖 [AGENT] Response received:");
    console.log(`       Agent: ${response.agentName || response.agentId}`);
    console.log(`       Task ID: ${response.taskId}`);
    console.log(`       Success: ${response.success}`);
    if (response.humanized) {
      console.log(
        `       Content: ${response.humanized.substring(0, 100)}${response.humanized.length > 100 ? "..." : ""}`
      );
    }
  });

  sdk.on("agent:list", (agents) => {
    eventStats.agent++;
    console.log(`🤖 [AGENT] Agent list updated: ${agents.length} agents`);
  });

  // ============================================================================
  // MESSAGE EVENTS
  // ============================================================================

  sdk.on("message:sent", (message) => {
    eventStats.message++;
    console.log("📤 [MESSAGE] Message sent:");
    console.log(`       Type: ${message.type}`);
    console.log(`       Room: ${message.room || "N/A"}`);
  });

  sdk.on("message:received", (message) => {
    eventStats.message++;
    console.log("📥 [MESSAGE] Message received:");
    console.log(`       Type: ${message.type}`);
    console.log(`       From: ${message.from || "N/A"}`);
  });

  sdk.on("message:error", (error, message) => {
    eventStats.message++;
    console.error("📥 [MESSAGE] Message error:", error.message);
    if (message) {
      console.error(`       Message type: ${message.type}`);
    }
  });

  sdk.on("message:duplicate", (message) => {
    eventStats.message++;
    console.log("📥 [MESSAGE] Duplicate message detected and skipped:");
    console.log(`       ID: ${message.id}`);
    console.log(`       Type: ${message.type}`);
  });

  // ============================================================================
  // ROOM EVENTS
  // ============================================================================

  sdk.on("room:subscribed", (data) => {
    eventStats.room++;
    console.log(`🏠 [ROOM] Subscribed to room: ${data.roomId}`);
  });

  sdk.on("room:unsubscribed", (data) => {
    eventStats.room++;
    console.log(`🏠 [ROOM] Unsubscribed from room: ${data.roomId}`);
  });

  sdk.on("room:list", (rooms) => {
    eventStats.room++;
    console.log(`🏠 [ROOM] Room list received: ${rooms.length} rooms`);
  });

  // ============================================================================
  // WEBHOOK EVENTS
  // ============================================================================

  sdk.on("webhook:sent", (payload, url) => {
    eventStats.webhook++;
    console.log("🌐 [WEBHOOK] Webhook sent:");
    console.log(`       URL: ${url}`);
    console.log(`       Event: ${payload.event}`);
  });

  sdk.on("webhook:success", (response, url) => {
    eventStats.webhook++;
    console.log(`🌐 [WEBHOOK] ✅ Delivery successful to ${url}`);
  });

  sdk.on("webhook:error", (error, url) => {
    eventStats.webhook++;
    console.error(`🌐 [WEBHOOK] ❌ Delivery failed to ${url}:`);
    console.error(`       Error: ${error.message}`);
  });

  sdk.on("webhook:retry", (attempt, url) => {
    eventStats.webhook++;
    console.log(`🌐 [WEBHOOK] 🔄 Retry attempt ${attempt} to ${url}`);
  });

  // ============================================================================
  // SIGNATURE EVENTS (SEC-2)
  // ============================================================================

  sdk.on("signature:verified", (messageType, address) => {
    eventStats.signature++;
    console.log("🔏 [SIGNATURE] ✅ Signature verified:");
    console.log(`       Message type: ${messageType}`);
    console.log(`       Address: ${address}`);
  });

  sdk.on("signature:failed", (messageType, reason, address) => {
    eventStats.signature++;
    console.error("🔏 [SIGNATURE] ❌ Verification failed:");
    console.error(`       Message type: ${messageType}`);
    console.error(`       Reason: ${reason}`);
    if (address) {
      console.error(`       Address: ${address}`);
    }
  });

  sdk.on("signature:missing", (messageType, required) => {
    eventStats.signature++;
    console.log("🔏 [SIGNATURE] ⚠️  Signature missing:");
    console.log(`       Message type: ${messageType}`);
    console.log(`       Required: ${required}`);
  });

  // ============================================================================
  // COORDINATOR EVENTS
  // ============================================================================

  sdk.on("coordinator:processing", (request) => {
    eventStats.agent++;
    console.log("🎯 [COORDINATOR] Processing request:", request);
  });

  sdk.on("coordinator:selected", (agentId, reasoning) => {
    eventStats.agent++;
    console.log("🎯 [COORDINATOR] Selected agent:");
    console.log(`       Agent ID: ${agentId}`);
    console.log(`       Reasoning: ${reasoning}`);
  });

  sdk.on("coordinator:error", (error) => {
    eventStats.error++;
    console.error("🎯 [COORDINATOR] Error:", error);
  });

  // ============================================================================
  // LIFECYCLE EVENTS
  // ============================================================================

  sdk.on("ready", () => {
    eventStats.other++;
    console.log("✅ [LIFECYCLE] SDK ready!");
  });

  sdk.on("disconnect", () => {
    eventStats.other++;
    console.log("👋 [LIFECYCLE] SDK disconnected");
  });

  sdk.on("destroy", () => {
    eventStats.other++;
    console.log("🗑️  [LIFECYCLE] SDK destroyed");
  });

  // ============================================================================
  // ERROR EVENTS
  // ============================================================================

  sdk.on("error", (error) => {
    eventStats.error++;
    console.error("❌ [ERROR] SDK error:", error.message);
    if (error.stack) {
      console.error("       Stack:", error.stack.split("\n").slice(0, 3).join("\n"));
    }
  });

  sdk.on("warning", (warning) => {
    eventStats.error++;
    console.warn("⚠️  [WARNING]", warning);
  });

  // ============================================================================
  // CONNECT AND TRIGGER EVENTS
  // ============================================================================

  try {
    console.log("📡 Connecting to Teneo network...\n");
    console.log("=".repeat(80));
    console.log("Listening to all events... (will run for 30 seconds)");
    console.log("=".repeat(80) + "\n");

    await sdk.connect();

    // Wait for agents
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Trigger some events for demonstration
    console.log("\n🔧 Triggering events for demonstration...\n");

    // Get agents
    const agents = sdk.getAgents();
    console.log(`Found ${agents.length} agents\n`);

    if (agents.length > 0) {
      // Send a test message
      const testAgent = agents.find((a) => a.status === "online") || agents[0];
      console.log(`Sending test message to ${testAgent.name || testAgent.id}...\n`);

      await sdk.sendDirectCommand(
        {
          agent: testAgent.id,
          command: "hello event listener test",
          room: DEFAULT_ROOM
        },
        false
      );
    }

    // Keep listening for events
    console.log("Listening to events for 30 seconds...\n");
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    // Display statistics
    console.log("\n\n" + "=".repeat(80));
    console.log("📊 EVENT STATISTICS");
    console.log("=".repeat(80));
    console.log(`Connection events:    ${eventStats.connection}`);
    console.log(`Authentication events: ${eventStats.auth}`);
    console.log(`Message events:       ${eventStats.message}`);
    console.log(`Agent events:         ${eventStats.agent}`);
    console.log(`Room events:          ${eventStats.room}`);
    console.log(`Webhook events:       ${eventStats.webhook}`);
    console.log(`Signature events:     ${eventStats.signature}`);
    console.log(`Error/Warning events: ${eventStats.error}`);
    console.log(`Other events:         ${eventStats.other}`);
    console.log("-".repeat(80));
    const total = Object.values(eventStats).reduce((a, b) => a + b, 0);
    console.log(`Total events:         ${total}`);
    console.log("=".repeat(80) + "\n");

    sdk.disconnect();
    sdk.destroy();
    console.log("✅ Disconnected");
    console.log("🎉 Example completed!");
  }
}

main().catch(console.error);
