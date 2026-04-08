/**
 * Diagnose connection and message flow
 * Run with: npx tsx scripts/diagnose-connection.ts
 */

import { TeneoSDK, SDKConfigBuilder } from "../src";
import { SecurePrivateKey } from "../src/utils/secure-private-key";

const WS_URL = process.env.TENEO_WS_URL || "wss://backend.developer.chatroom.teneo-protocol.ai/ws";
const TEST_PRIVATE_KEY = process.env.TENEO_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE";

async function diagnose() {
  console.log("=".repeat(60));
  console.log("CONNECTION DIAGNOSTIC");
  console.log("=".repeat(60));

  const secureKey = new SecurePrivateKey(TEST_PRIVATE_KEY);

  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey)
    .withLogging("debug")
    .withPayments({ autoApprove: false })
    .build();

  const sdk = new TeneoSDK(config);

  // Listen to all events
  const events = [
    "connected",
    "disconnected",
    "authenticated",
    "error",
    "message:received",
    "message:sent",
    "message:error",
    "agent:response",
    "agent:selected",
    "agents:list"
  ];

  for (const event of events) {
    sdk.on(event as any, (data: any) => {
      console.log(`\n[EVENT: ${event}]`);
      if (typeof data === "object") {
        console.log(JSON.stringify(data, null, 2).substring(0, 500));
      } else {
        console.log(data);
      }
    });
  }

  try {
    console.log("\nConnecting...");
    await sdk.connect();
    console.log("\nConnected!");

    // Get auth state
    const authState = sdk.getAuthState();
    console.log("\nAuth State:", JSON.stringify(authState, null, 2));

    // Get connection state
    const connState = sdk.getConnectionState();
    console.log("\nConnection State:", JSON.stringify(connState, null, 2));

    // Wait for agents list
    console.log("\nWaiting for agents list (10s)...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Try to send a simple message (fire and forget)
    console.log("\nSending test message (fire and forget)...");
    try {
      await sdk.sendMessage("hello", { room: "public" });
      console.log("Message sent successfully");
    } catch (err) {
      console.log("Send error:", err);
    }

    // Wait for any response
    console.log("\nWaiting for response (15s)...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    await sdk.disconnect();
    console.log("\nDisconnected");
  } catch (error) {
    console.error("Error:", error);
  }

  process.exit(0);
}

diagnose().catch(console.error);
