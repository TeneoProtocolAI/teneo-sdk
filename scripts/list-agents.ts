/**
 * List available agents
 * Run with: npx tsx scripts/list-agents.ts
 */

import { TeneoSDK, SDKConfigBuilder } from "../src";
import { SecurePrivateKey } from "../src/utils/secure-private-key";

const WS_URL = process.env.TENEO_WS_URL || "wss://backend.developer.chatroom.teneo-protocol.ai/ws";
const TEST_PRIVATE_KEY = process.env.TENEO_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE";

async function listAgents() {
  console.log("Listing available agents...\n");

  const secureKey = new SecurePrivateKey(TEST_PRIVATE_KEY);

  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey)
    .withLogging("warn")
    .build();

  const sdk = new TeneoSDK(config);

  try {
    await sdk.connect();
    console.log("Connected!\n");

    // Wait for agents list
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get auth state for rooms
    const authState = sdk.getAuthState();
    console.log("User's rooms:", authState.rooms);
    console.log("Private room:", authState.privateRoomIds?.[0] || "none");
    console.log();

    // Get available agents
    const agents = sdk.agents.getAgents();
    console.log(`Available agents (${agents.length}):\n`);

    for (const agent of agents) {
      console.log(`- ${agent.name} (${agent.id})`);
      console.log(`  Description: ${agent.description?.substring(0, 100)}...`);
      console.log(`  Online: ${agent.isOnline}`);
      console.log(`  Rooms: ${agent.rooms?.join(", ") || "N/A"}`);
      console.log();
    }

    await sdk.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }

  process.exit(0);
}

listAgents().catch(console.error);
