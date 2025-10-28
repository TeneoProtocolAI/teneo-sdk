/**
 * Example 1: Basic SDK Connection
 *
 * This example demonstrates:
 * - Building SDK configuration
 * - Connecting to Teneo WebSocket
 * - Basic authentication
 * - Graceful disconnection
 *
 * Run: npx tsx examples/usage/01-connect.ts
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

async function main() {
  console.log("🚀 Example 1: Basic SDK Connection\n");

  // Validate required configuration
  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required");
    console.error("Set it with: export PRIVATE_KEY=your_private_key\n");
    process.exit(1);
  }

  console.log("📋 Configuration:");
  console.log(`   WebSocket URL: ${WS_URL}`);
  console.log(`   Default Room: ${DEFAULT_ROOM}`);
  console.log(`   Private Key: ${PRIVATE_KEY.substring(0, 10)}...`);
  console.log("");

  // Step 1: Build SDK configuration using the fluent builder API
  console.log("⚙️  Step 1: Building SDK configuration...");
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withLogging("info")
    .withReconnection({ enabled: true, delay: 5000, maxAttempts: 3 })
    .build();
  console.log("✅ Configuration built\n");

  // Step 2: Create SDK instance
  console.log("⚙️  Step 2: Creating SDK instance...");
  const sdk = new TeneoSDK(config);
  console.log("✅ SDK instance created\n");

  // Step 3: Set up event listeners for connection lifecycle
  console.log("⚙️  Step 3: Setting up event listeners...");

  sdk.on("connection:open", () => {
    console.log("🔌 WebSocket connection opened");
  });

  sdk.on("auth:challenge", (challenge) => {
    console.log("🔐 Authentication challenge received");
  });

  sdk.on("auth:success", (state) => {
    console.log("✅ Authentication successful!");
    console.log(`   Wallet: ${state.walletAddress}`);
    console.log(`   Whitelisted: ${state.isWhitelisted}`);
    console.log(`   Rooms: ${state.rooms?.length || 0}`);
  });

  sdk.on("connection:close", (code, reason) => {
    console.log(`🔌 Connection closed: ${code} - ${reason}`);
  });

  sdk.on("error", (error) => {
    console.error("❌ SDK Error:", error.message);
  });

  console.log("✅ Event listeners configured\n");

  try {
    // Step 4: Connect to Teneo network
    console.log("⚙️  Step 4: Connecting to Teneo network...");
    await sdk.connect();
    console.log("✅ Connected and authenticated!\n");

    // Step 5: Check connection state
    console.log("⚙️  Step 5: Checking connection state...");
    const connectionState = sdk.getConnectionState();
    const authState = sdk.getAuthState();

    console.log("📊 Connection Status:");
    console.log(`   Connected: ${connectionState.connected}`);
    console.log(`   Authenticated: ${connectionState.authenticated}`);
    console.log(`   Wallet: ${authState.walletAddress}`);
    console.log("");

    // Keep connection alive for a few seconds
    console.log("⏳ Keeping connection alive for 3 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  } finally {
    // Step 6: Graceful disconnection
    console.log("\n⚙️  Step 6: Disconnecting...");
    sdk.disconnect();
    sdk.destroy();
    console.log("✅ Disconnected and cleaned up\n");
    console.log("🎉 Example completed successfully!");
  }
}

// Run the example
main().catch(console.error);
