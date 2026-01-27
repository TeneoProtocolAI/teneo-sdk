/**
 * Payment Flow Example - Quote-Approve payment flow with Teneo SDK
 * Demonstrates manual quote approval: request a quote, inspect pricing, then confirm.
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm tsx examples/payment-flow.ts
 */

import { TeneoSDK, SDKConfigBuilder, SecurePrivateKey } from "../src";

const WS_URL = process.env.WS_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Missing PRIVATE_KEY. Run with: PRIVATE_KEY=0x... pnpm tsx examples/payment-flow.ts");
    process.exit(1);
  }

  const secureKey = new SecurePrivateKey(PRIVATE_KEY);

  // Configure SDK with manual quote approval
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey)
    .withPayments({
      autoApprove: false,           // Manual approval — we'll inspect quotes first
      maxPricePerRequest: 1000000   // Max 1 USDC (in micro-units)
    })
    .withReconnection({ enabled: false })
    .withLogging("warn")
    .build();

  const sdk = new TeneoSDK(config);

  // --- Payment events ---

  sdk.on("quote:received", (quote) => {
    console.log(`[quote:received] Agent: ${quote.agentName}, Price: ${quote.pricing?.pricePerUnit} micro-USDC`);
  });

  sdk.on("payment:attached", (data) => {
    console.log(`[payment:attached] Agent: ${data.agentId}, Amount: ${data.amount}, Command: ${data.command}`);
  });

  sdk.on("payment:blocked", (data) => {
    console.log(`[payment:blocked] Agent ${data.agentId} wants ${data.agentPrice} but max is ${data.maxPrice}`);
  });

  sdk.on("payment:error", (err, agentId) => {
    console.error(`[payment:error] Agent: ${agentId}, Error: ${err.message}`);
  });

  // --- General events ---

  sdk.on("agent:response", (r) => {
    console.log(`\n[agent:response] ${r.agentName || "Agent"}: ${r.humanized || r.content || JSON.stringify(r.raw)}`);
  });

  sdk.on("error", (e) => console.error("[error]", e.message));

  try {
    console.log("Connecting...");
    await sdk.connect();
    console.log("Connected!\n");

    // Pick a room
    const rooms = sdk.getRooms();
    if (!rooms.length) {
      console.log("No rooms available.");
      return;
    }

    const roomId = rooms[0].id;
    console.log(`Using room: ${rooms[0].name || roomId}\n`);

    // --- Step 1: Request a quote ---
    console.log("Requesting quote...");
    const quote = await sdk.requestQuote(
      "Analyze Bitcoin trends for the past week",
      roomId
    );

    console.log("\nQuote received:");
    console.log(`  Task ID:  ${quote.taskId}`);
    console.log(`  Agent:    ${quote.agentName} (${quote.agentId})`);
    console.log(`  Price:    ${quote.pricing.pricePerUnit} micro-USDC (${quote.pricing.priceType})`);
    console.log(`  Expires:  ${quote.expiresAt}`);

    // --- Step 2: Decide whether to confirm ---
    const MAX_ACCEPTABLE = 500000; // 0.5 USDC in micro-units

    if (quote.pricing.pricePerUnit > MAX_ACCEPTABLE) {
      console.log(`\nPrice ${quote.pricing.pricePerUnit} exceeds limit of ${MAX_ACCEPTABLE}. Skipping.`);
      return;
    }

    // --- Step 3: Confirm the quote and wait for the response ---
    console.log("\nConfirming quote and waiting for response...");
    const response = await sdk.confirmQuote(quote.taskId, {
      waitForResponse: true,
      timeout: 60000
    });

    if (response?.humanized) {
      console.log(`\nAgent response: ${response.humanized}`);
    } else if (response?.raw) {
      console.log(`\nAgent response (raw): ${JSON.stringify(response.raw, null, 2)}`);
    } else {
      console.log("\n(No response content)");
    }

    // --- Alternative: Check pending quote before confirming ---
    // const pending = sdk.getPendingQuote(quote.taskId);
    // if (pending) {
    //   console.log(`Still pending: ${pending.agentName}`);
    // }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    sdk.disconnect();
    sdk.destroy();
  }
}

main();
