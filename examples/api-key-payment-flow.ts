/**
 * API-Key Payment Flow Example
 *
 * Demonstrates authentication and payment using API key instead of private key.
 * The backend handles payment signing server-side using the stored session key.
 *
 * No MetaMask or private key needed — just API key + wallet address.
 *
 * Usage:
 *   API_KEY=sk_live_... WALLET_ADDRESS=0x... pnpm tsx examples/api-key-payment-flow.ts
 */

import { TeneoSDK, SDKConfigBuilder } from "../src";

const WS_URL = process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const API_KEY = process.env.API_KEY || "";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "";

async function main() {
  if (!API_KEY) {
    console.error("Missing API_KEY. Run with: API_KEY=sk_live_... WALLET_ADDRESS=0x... pnpm tsx examples/api-key-payment-flow.ts");
    process.exit(1);
  }

  if (!WALLET_ADDRESS) {
    console.error("Missing WALLET_ADDRESS.");
    process.exit(1);
  }

  // Configure SDK with API key — no privateKey needed
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withApiKey(API_KEY, WALLET_ADDRESS)
    .withNetwork("peaq")
    .withReconnection({ enabled: false })
    .withLogging("debug")
    .build();

  const sdk = new TeneoSDK(config);

  // --- Auth events ---
  sdk.on("auth:success", (state) => {
    console.log(`[auth:success] Authenticated as: ${state.walletAddress}`);
  });

  // --- Payment events ---
  sdk.on("quote:received", (quote) => {
    console.log(`[quote:received] Agent: ${quote.agentName}, Price: ${quote.pricing?.pricePerUnit}`);
  });

  sdk.on("task:confirmed", (data) => {
    console.log(`[task:confirmed] Task ${data.taskId} confirmed`);
  });

  sdk.on("payment:error", (err) => {
    console.error(`[payment:error] ${err.message}`);
  });

  // --- Agent response ---
  sdk.on("agent:response", (r) => {
    console.log(`\n[agent:response] ${r.agentName || "Agent"}: ${r.humanized || r.content || JSON.stringify(r.raw)}`);
  });

  sdk.on("error", (error) => {
    console.error(`[error] ${error.message}`);
  });

  try {
    console.log("Connecting with API key auth...");
    await sdk.connect();
    console.log("Connected!\n");

    // Send a message — the SDK will handle request_task -> task_quote -> confirm_task with api_key
    const prompt = process.argv[2] || "give me 5 posts from elonmusk from x.com";
    const room = DEFAULT_ROOM || sdk.getRooms()[0]?.id;

    if (!room) {
      console.error("No room available. Set DEFAULT_ROOM env var.");
      process.exit(1);
    }

    console.log(`Sending: "${prompt}" to room ${room}\n`);

    const response = await sdk.sendMessage(prompt, {
      room,
      waitForResponse: true,
      timeout: 60000
    });

    if (response) {
      console.log("\n--- Response ---");
      console.log(response.humanized || response.content || JSON.stringify(response));
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    sdk.destroy();
    console.log("\nDone.");
  }
}

main().catch(console.error);
