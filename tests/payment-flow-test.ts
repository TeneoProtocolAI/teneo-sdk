/**
 * Payment Flow Test - Tests the quote-approve payment flow
 *
 * Setup:
 *   Create a .env file in the teneo-sdk root with:
 *     PRIVATE_KEY=your_private_key_here
 *     WS_URL=wss://backend.developer.chatroom.teneo-protocol.ai/ws  # optional
 *
 * Run:
 *   npx tsx tests/payment-flow-test.ts
 */

import "dotenv/config";
import { TeneoSDK } from "../src/teneo-sdk";

// Configuration from environment variables (loaded from .env)
const WS_URL = process.env.WS_URL || "wss://backend.developer.chatroom.teneo-protocol.ai/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("❌ Missing PRIVATE_KEY");
  console.error("");
  console.error("Setup: Create a .env file in the teneo-sdk root with:");
  console.error("  PRIVATE_KEY=your_private_key_here");
  console.error("");
  console.error("Then run:");
  console.error("  npx tsx tests/payment-flow-test.ts");
  process.exit(1);
}

// Type assertion after validation
const privateKey: string = PRIVATE_KEY;

let TEST_ROOM = ""; // Will be set after auth to use user's private room

async function testPaymentFlow() {
  console.log("=== Payment Flow Test ===\n");
  console.log("WebSocket URL:", WS_URL);

  // Create SDK with quote-approve enabled
  const config = TeneoSDK.builder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(privateKey)
    .withPayments({
      autoApprove: true,
      maxPricePerRequest: 10_000_000 // Max 10 USDC
    })
    .withLogging("info")
    .build();

  const sdk = new TeneoSDK(config);

  // Set up event listeners
  sdk.on("connection:open", () => console.log("✓ Connected"));
  sdk.on("auth:success", (state) => {
    console.log("✓ Authenticated as:", state.walletAddress);
    // Get user's first private room
    if (state.privateRoomIds && state.privateRoomIds.length > 0) {
      TEST_ROOM = state.privateRoomIds[0];
      console.log("✓ Using room:", TEST_ROOM);
    } else if (state.rooms && state.rooms.length > 0) {
      TEST_ROOM = state.rooms[0];
      console.log("✓ Using room:", TEST_ROOM);
    }
  });
  sdk.on("quote:received", (quote) => {
    console.log("\n📋 Quote Received:");
    console.log("  Task ID:", quote.data.task_id);
    console.log("  Agent:", quote.data.agent_name);
    console.log("  Price:", quote.data.pricing.pricePerUnit, "USDC");
    console.log("  Expires:", quote.data.expires_at);
  });
  sdk.on("payment:attached", (data) => {
    console.log("\n💰 Payment Attached:");
    console.log("  Agent:", data.agentId);
    console.log("  Amount:", data.amount / 1_000_000, "USDC");
    console.log("  Command:", data.command);
  });
  sdk.on("agent:response", (response) => {
    console.log("\n📥 Agent Response:");
    console.log("  Success:", response.success);
    console.log("  Content:", response.content.substring(0, 200) + "...");
  });
  sdk.on("error", (error) => console.error("❌ Error:", error.message));

  try {
    // Connect
    console.log("\nConnecting to", WS_URL);
    await sdk.connect();
    console.log("Connected!\n");

    // Wait for auth to complete and room to be set
    await sleep(500);

    if (!TEST_ROOM) {
      throw new Error("No room available - auth may have failed");
    }

    // Subscribe to test room
    console.log("Subscribing to room:", TEST_ROOM);
    try {
      await sdk.subscribeToRoom(TEST_ROOM);
      console.log("Subscribed!\n");
    } catch {
      console.log("Room subscription skipped (private room)\n");
    }

    // Wait a bit for connection to stabilize
    await sleep(1000);

    // Send test message - this will trigger quote-approve flow
    console.log("\n=== Sending Test Request ===");
    console.log('Request: "get me 1 post from @elonmusk from x"\n');

    const response = await sdk.sendMessage("get me 1 post from @elonmusk from x", {
      room: TEST_ROOM,
      waitForResponse: true,
      timeout: 120000 // 2 minutes
    });

    if (response) {
      console.log("\n=== Test Complete ===");
      console.log("Response received successfully!");
      console.log(
        "Humanized:",
        typeof response.humanized === "string" ? response.humanized.substring(0, 500) : response
      );
    }
  } catch (error: unknown) {
    const err = error as Error & { details?: unknown };
    console.error("\n❌ Test failed:", err.message);
    if (err.details) {
      console.error("Details:", err.details);
    }
  } finally {
    console.log("\nDisconnecting...");
    sdk.destroy();
    console.log("Done!");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test
testPaymentFlow().catch(console.error);
