/**
 * Live Multi-Network Test
 * Tests direct agent requests and coordinator requests across PEAQ, Base, and Avalanche
 * Run with: npx tsx scripts/live-multi-network-test.ts
 */

import { TeneoSDK, SDKConfigBuilder } from "../src";
import { SecurePrivateKey } from "../src/utils/secure-private-key";

const WS_URL = process.env.TENEO_WS_URL || "wss://backend.developer.chatroom.teneo-protocol.ai/ws";
const TEST_PRIVATE_KEY = process.env.TENEO_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE";

interface TestResult {
  network: string;
  type: "direct" | "coordinator";
  success: boolean;
  response?: string;
  txHash?: string;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest() {
  console.log("=".repeat(70));
  console.log("LIVE MULTI-NETWORK TEST");
  console.log("=".repeat(70));
  console.log(`WebSocket: ${WS_URL}`);
  console.log(`Networks: PEAQ (3338), Base (8453), Avalanche (43114)\n`);

  const secureKey = new SecurePrivateKey(TEST_PRIVATE_KEY);

  // Test each network
  // Test all networks
  const networks = ["peaq", "base", "avalanche"] as const;

  for (const network of networks) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`TESTING NETWORK: ${network.toUpperCase()}`);
    console.log("=".repeat(70));

    let sdk: TeneoSDK | null = null;

    try {
      // Create SDK with network configuration
      // Enable auto-approve for payments (wallet has USDC)
      const config = new SDKConfigBuilder()
        .withWebSocketUrl(WS_URL)
        .withAuthentication(secureKey)
        .withNetwork(network)
        .withLogging("warn")
        .withPayments({ autoApprove: true })
        .build();

      sdk = new TeneoSDK(config);

      // Connect and authenticate
      console.log(`\nConnecting to ${network}...`);
      await sdk.connect();
      console.log(`Connected and authenticated on ${network}`);

      // Wait for agents list
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get the user's private room
      const authState = sdk.getAuthState();
      const privateRoom = authState.privateRoomIds?.[0] || authState.rooms?.[0] || "public";
      console.log(`Using room: ${privateRoom}`);

      // Test 1: Direct agent request
      console.log(`\n--- Direct Request (@x-agent-enterprise-v2) ---`);
      const directStart = Date.now();
      try {
        const directResponse = await sdk.sendMessage("@x-agent-enterprise-v2 user @elonmusk", {
          room: privateRoom,
          waitForResponse: true,
          timeout: 60000
        });

        const directDuration = Date.now() - directStart;
        const directResult: TestResult = {
          network,
          type: "direct",
          success: true,
          response:
            typeof directResponse === "string"
              ? directResponse.substring(0, 200) + "..."
              : JSON.stringify(directResponse).substring(0, 200) + "...",
          duration: directDuration
        };

        // Try to extract tx hash from response
        if (typeof directResponse === "object" && directResponse !== null) {
          const respObj = directResponse as Record<string, unknown>;
          if (respObj.txHash) directResult.txHash = String(respObj.txHash);
          if (respObj.payment_tx_hash) directResult.txHash = String(respObj.payment_tx_hash);
          if (respObj.paymentTxHash) directResult.txHash = String(respObj.paymentTxHash);
          // Check nested metadata
          const metadata = respObj.metadata as Record<string, unknown> | undefined;
          if (metadata?.txHash) directResult.txHash = String(metadata.txHash);
          if (metadata?.payment_tx_hash) directResult.txHash = String(metadata.payment_tx_hash);
        }
        // Log full response for debugging
        console.log("Full response:", JSON.stringify(directResponse, null, 2).substring(0, 1000));

        results.push(directResult);
        console.log(`Response (${directDuration}ms):`);
        console.log(directResult.response);
        if (directResult.txHash) console.log(`TX Hash: ${directResult.txHash}`);
      } catch (error) {
        const directDuration = Date.now() - directStart;
        results.push({
          network,
          type: "direct",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: directDuration
        });
        console.log(
          `Error (${directDuration}ms): ${error instanceof Error ? error.message : error}`
        );
      }

      // Wait between requests
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test 2: Coordinator request
      console.log(`\n--- Coordinator Request ---`);
      const coordStart = Date.now();
      try {
        const coordResponse = await sdk.sendMessage("give me 1 post from @elonmusk on x", {
          room: privateRoom,
          waitForResponse: true,
          timeout: 60000
        });

        const coordDuration = Date.now() - coordStart;
        const coordResult: TestResult = {
          network,
          type: "coordinator",
          success: true,
          response:
            typeof coordResponse === "string"
              ? coordResponse.substring(0, 200) + "..."
              : JSON.stringify(coordResponse).substring(0, 200) + "...",
          duration: coordDuration
        };

        // Try to extract tx hash from response
        if (typeof coordResponse === "object" && coordResponse !== null) {
          const respObj = coordResponse as Record<string, unknown>;
          if (respObj.txHash) coordResult.txHash = String(respObj.txHash);
          if (respObj.payment_tx_hash) coordResult.txHash = String(respObj.payment_tx_hash);
          if (respObj.paymentTxHash) coordResult.txHash = String(respObj.paymentTxHash);
          // Check nested metadata
          const metadata = respObj.metadata as Record<string, unknown> | undefined;
          if (metadata?.txHash) coordResult.txHash = String(metadata.txHash);
          if (metadata?.payment_tx_hash) coordResult.txHash = String(metadata.payment_tx_hash);
        }
        // Log full response for debugging
        console.log("Full response:", JSON.stringify(coordResponse, null, 2).substring(0, 1000));

        results.push(coordResult);
        console.log(`Response (${coordDuration}ms):`);
        console.log(coordResult.response);
        if (coordResult.txHash) console.log(`TX Hash: ${coordResult.txHash}`);
      } catch (error) {
        const coordDuration = Date.now() - coordStart;
        results.push({
          network,
          type: "coordinator",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: coordDuration
        });
        console.log(
          `Error (${coordDuration}ms): ${error instanceof Error ? error.message : error}`
        );
      }
    } catch (error) {
      console.error(`Failed to test ${network}:`, error instanceof Error ? error.message : error);
    } finally {
      if (sdk) {
        await sdk.disconnect();
        console.log(`\nDisconnected from ${network}`);
      }
    }

    // Wait between networks
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("TEST RESULTS SUMMARY");
  console.log("=".repeat(70));

  console.log("\n| Network    | Type        | Success | Duration | TX Hash |");
  console.log("|------------|-------------|---------|----------|---------|");

  for (const result of results) {
    const txHash = result.txHash ? result.txHash.substring(0, 10) + "..." : "N/A";
    console.log(
      `| ${result.network.padEnd(10)} | ${result.type.padEnd(11)} | ${result.success ? "YES    " : "NO     "} | ${(result.duration + "ms").padEnd(8)} | ${txHash} |`
    );
  }

  // Print detailed results
  console.log("\n--- Detailed Results ---\n");
  for (const result of results) {
    console.log(`${result.network.toUpperCase()} - ${result.type}:`);
    if (result.success) {
      console.log(`  Response: ${result.response}`);
      if (result.txHash) console.log(`  TX Hash: ${result.txHash}`);
    } else {
      console.log(`  Error: ${result.error}`);
    }
    console.log();
  }

  // Exit
  process.exit(results.every((r) => r.success) ? 0 : 1);
}

runTest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
