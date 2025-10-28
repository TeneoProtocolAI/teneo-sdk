/**
 * Example 4: Find Agents by Capability
 *
 * This example demonstrates:
 * - PERF-3: O(1) indexed agent lookups by capability
 * - Finding agents by specific capabilities
 * - Finding agents by status (online/offline)
 * - Finding agents by name (token-based search)
 * - Performance comparison of different search methods
 *
 * Run: npx tsx examples/usage/04-find-by-capability.ts
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";

async function main() {
  console.log("🚀 Example 4: Find Agents by Capability\n");

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
    process.exit(1);
  }

  // Build SDK
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withLogging("info")
    .build();

  const sdk = new TeneoSDK(config);

  try {
    // Connect
    console.log("🔌 Connecting to Teneo network...");
    await sdk.connect();
    console.log("✅ Connected!\n");

    // Wait for agents
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get all agents
    const allAgents = sdk.getAgents();
    console.log(`📊 Total agents in network: ${allAgents.length}\n`);

    if (allAgents.length === 0) {
      console.log("❌ No agents available");
      return;
    }

    // Step 1: Display all available capabilities
    console.log("⚙️  Step 1: Discovering available capabilities...");
    const capabilitiesSet = new Set<string>();

    allAgents.forEach((agent) => {
      if (agent.capabilities) {
        agent.capabilities.forEach((cap) => {
          capabilitiesSet.add(cap.name);
        });
      }
    });

    const capabilities = Array.from(capabilitiesSet).sort();
    console.log(`✅ Found ${capabilities.length} unique capabilities:\n`);

    if (capabilities.length > 0) {
      console.log("📋 Available Capabilities:");
      capabilities.forEach((cap, index) => {
        const agentsWithCap = allAgents.filter((a) => a.capabilities?.some((c) => c.name === cap));
        console.log(`   ${index + 1}. ${cap} (${agentsWithCap.length} agents)`);
      });
      console.log("");
    } else {
      console.log("⚠️  No capabilities defined for any agents\n");
    }

    // Step 2: Find agents by capability (O(1) lookup)
    if (capabilities.length > 0) {
      console.log("⚙️  Step 2: Finding agents by capability (O(1) indexed lookup)...");

      // Try to find agents with specific capabilities
      const testCapabilities = [
        capabilities[0], // First capability
        "weather-forecast",
        "social-media",
        "data-analysis"
      ];

      for (const capability of testCapabilities) {
        console.log(`\n🔍 Searching for capability: "${capability}"`);
        const startTime = performance.now();
        const agentsWithCap = sdk.findAgentsByCapability(capability);
        const duration = performance.now() - startTime;

        if (agentsWithCap.length > 0) {
          console.log(`✅ Found ${agentsWithCap.length} agent(s) (${duration.toFixed(3)}ms):`);
          agentsWithCap.forEach((agent) => {
            console.log(`   • ${agent.name || agent.id}`);
            const cap = agent.capabilities?.find((c) => c.name === capability);
            if (cap) {
              console.log(`     ${cap.description}`);
            }
          });
        } else {
          console.log(
            `❌ No agents found with capability "${capability}" (${duration.toFixed(3)}ms)`
          );
        }
      }
    }

    // Step 3: Find agents by status (O(1) lookup)
    console.log("\n⚙️  Step 3: Finding agents by status (O(1) indexed lookup)...");

    console.log("\n🔍 Online agents:");
    const startTimeOnline = performance.now();
    const onlineAgents = sdk.findAgentsByStatus("online");
    const durationOnline = performance.now() - startTimeOnline;
    console.log(`✅ Found ${onlineAgents.length} online agents (${durationOnline.toFixed(3)}ms):`);
    onlineAgents.forEach((agent) => {
      console.log(`   • ${agent.name || agent.id} (${agent.status})`);
    });

    console.log("\n🔍 Offline agents:");
    const startTimeOffline = performance.now();
    const offlineAgents = sdk.findAgentsByStatus("offline");
    const durationOffline = performance.now() - startTimeOffline;
    console.log(
      `✅ Found ${offlineAgents.length} offline agents (${durationOffline.toFixed(3)}ms):`
    );
    offlineAgents.forEach((agent) => {
      console.log(`   • ${agent.name || agent.id} (${agent.status})`);
    });

    // Step 4: Find agents by name (O(k) token-based search)
    console.log("\n⚙️  Step 4: Finding agents by name (token-based search)...");

    const searchTerms = ["agent", "bot", "platform", "weather"];

    for (const term of searchTerms) {
      console.log(`\n🔍 Searching for name containing: "${term}"`);
      const startTime = performance.now();
      const foundAgents = sdk.findAgentsByName(term);
      const duration = performance.now() - startTime;

      if (foundAgents.length > 0) {
        console.log(`✅ Found ${foundAgents.length} agent(s) (${duration.toFixed(3)}ms):`);
        foundAgents.forEach((agent) => {
          console.log(`   • ${agent.name || agent.id}`);
        });
      } else {
        console.log(`❌ No agents found with "${term}" in name (${duration.toFixed(3)}ms)`);
      }
    }

    // Step 5: Performance summary
    console.log("\n📊 Performance Summary:");
    console.log("=".repeat(80));
    console.log("\nThe SDK uses indexed lookups for optimal performance:");
    console.log("   • Capability search: O(1) - constant time");
    console.log("   • Status search: O(1) - constant time");
    console.log("   • Name search: O(k) - where k is the number of tokens");
    console.log("\nAll searches complete in < 1ms even with many agents!");
    console.log("=".repeat(80));

    // Step 6: Practical example - find best agent for a task
    console.log("\n⚙️  Step 6: Practical example - finding best agent for a task...");
    console.log('\nTask: "Get Twitter timeline for a user"');
    console.log("Strategy: Find online agents with social-media or twitter capabilities\n");

    // First, try to find by specific capabilities
    let candidates = sdk.findAgentsByCapability("social-media");
    if (candidates.length === 0) {
      candidates = sdk.findAgentsByCapability("twitter");
    }
    if (candidates.length === 0) {
      candidates = sdk.findAgentsByCapability("x-platform");
    }

    // Filter to only online agents
    candidates = candidates.filter((a) => a.status === "online");

    // If no capability match, try name search
    if (candidates.length === 0) {
      console.log("⚠️  No capability match, trying name search...");
      const nameResults = sdk
        .findAgentsByName("twitter")
        .concat(sdk.findAgentsByName("x platform"))
        .concat(sdk.findAgentsByName("social"));

      // Remove duplicates and filter online
      const uniqueIds = new Set<string>();
      candidates = nameResults.filter((a) => {
        if (uniqueIds.has(a.id) || a.status !== "online") {
          return false;
        }
        uniqueIds.add(a.id);
        return true;
      });
    }

    if (candidates.length > 0) {
      console.log(`✅ Found ${candidates.length} suitable agent(s):`);
      candidates.forEach((agent, index) => {
        console.log(`\n   ${index + 1}. ${agent.name || agent.id}`);
        console.log(`      Status: ${agent.status}`);
        if (agent.description) {
          console.log(`      Description: ${agent.description}`);
        }
        if (agent.capabilities && agent.capabilities.length > 0) {
          console.log(`      Capabilities: ${agent.capabilities.map((c) => c.name).join(", ")}`);
        }
      });
      console.log(`\n💡 Recommendation: Use "${candidates[0].name || candidates[0].id}"`);
    } else {
      console.log("❌ No suitable agents found for this task");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    sdk.disconnect();
    sdk.destroy();
    console.log("\n✅ Disconnected");
    console.log("🎉 Example completed!");
  }
}

main().catch(console.error);
