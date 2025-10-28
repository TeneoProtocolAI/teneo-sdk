/**
 * Example 5: Webhook Integration (Production Pattern)
 *
 * This example demonstrates production-ready webhook integration
 * following the pattern from examples/production-dashboard:
 *
 * - Setting up a local webhook receiver with multiple endpoints
 * - Configuring SDK with allowInsecureWebhooks for local development
 * - Using sdk.configureWebhook() for runtime webhook setup
 * - Receiving and processing different webhook event types
 * - Webhook retry logic and error handling
 * - Circuit breaker behavior on failures
 * - Tracking webhook statistics and metrics
 *
 * The webhook server provides:
 * - POST /webhook - Receives webhook events from SDK
 * - GET /health - Health check with metrics
 * - GET /webhooks - List all received webhooks
 *
 * Run: npx tsx examples/usage/05-webhook-example.ts
 */

import "dotenv/config";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";
import express from "express";
import type { Request, Response } from "express";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "3001");
const WEBHOOK_SINK_PORT = parseInt(process.env.WEBHOOK_SINK_PORT || "3000");

// Track received webhooks for stats
let webhookCounter = 0;
const receivedWebhooks: any[] = [];

async function main() {
  console.log("🚀 Example 5: Webhook Integration\n");

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
    process.exit(1);
  }

  // Step 1: Set up local webhook receiver
  console.log("⚙️  Step 1: Setting up local webhook receiver...");

  const app = express();
  app.use(express.json());

  // Webhook endpoint - receives events from SDK
  app.post("/webhook", (req: Request, res: Response) => {
    const payload = req.body;
    webhookCounter++;

    // Store webhook for later display
    receivedWebhooks.push({
      ...payload,
      receivedAt: new Date().toISOString()
    });

    console.log(`\n🎯 Webhook #${webhookCounter} received!`);
    console.log("=".repeat(80));
    console.log(`Event: ${payload.event}`);
    console.log(`Timestamp: ${payload.timestamp}`);

    // Show specific data based on event type
    if (payload.event === "task_response") {
      console.log(`Agent: ${payload.data?.agentName || "Unknown"}`);
      console.log(`Task ID: ${payload.data?.taskId}`);
      console.log(`Success: ${payload.data?.success !== false}`);
      if (payload.data?.humanized) {
        const preview = payload.data.humanized.substring(0, 100);
        console.log(`Response: ${preview}${payload.data.humanized.length > 100 ? "..." : ""}`);
      }
    } else if (payload.event === "agent_selected") {
      console.log(`Agent: ${payload.data?.agent_name || "Unknown"}`);
      console.log(`Reasoning: ${payload.data?.reasoning || "N/A"}`);
    } else {
      console.log(`Data: ${JSON.stringify(payload.data, null, 2).substring(0, 200)}`);
    }

    if (payload.metadata) {
      console.log(
        `Metadata: Room=${payload.metadata.roomId}, Agent=${payload.metadata.agentId || "N/A"}`
      );
    }
    console.log("=".repeat(80) + "\n");

    // Respond with success
    res.status(200).json({
      success: true,
      received_at: new Date().toISOString(),
      webhook_count: webhookCounter
    });
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      webhooksReceived: webhookCounter,
      uptime: process.uptime()
    });
  });

  // Webhook list endpoint - view all received webhooks
  app.get("/webhooks", (_req: Request, res: Response) => {
    res.json({
      total: webhookCounter,
      webhooks: receivedWebhooks
    });
  });

  const server = app.listen(WEBHOOK_SINK_PORT, () => {
    console.log(`✅ Webhook server running on http://localhost:${WEBHOOK_SINK_PORT}`);
    console.log(`   POST http://localhost:${WEBHOOK_PORT}/webhook - Receive webhooks`);
    console.log(`   GET  http://localhost:${WEBHOOK_PORT}/health - Health check`);
    console.log(`   GET  http://localhost:${WEBHOOK_PORT}/webhooks - List all webhooks`);
    console.log("");
  });

  // Step 2: Build SDK with webhook configuration
  console.log("⚙️  Step 2: Building SDK and configuring webhook...");

  const webhookUrl = `http://localhost:${WEBHOOK_PORT}/webhook`;

  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY)
    // .withAutoJoinRooms([DEFAULT_ROOM])
    .withResponseFormat({ format: "both", includeMetadata: true })
    .withLogging("info")
    .build();

  // IMPORTANT: Allow insecure webhooks for local development
  // In production, remove this and use HTTPS webhooks only
  config.allowInsecureWebhooks = true;

  const sdk = new TeneoSDK(config);

  // Configure webhook after SDK creation (production-dashboard pattern)
  // This allows runtime webhook configuration with custom headers
  sdk.configureWebhook(webhookUrl, {
    "X-API-Key": "webhook-example-secret",
    "Content-Type": "application/json"
  });

  console.log(`✅ SDK configured with webhook: ${webhookUrl}`);
  console.log("   Custom headers: X-API-Key, Content-Type\n");

  // Step 3: Monitor webhook events
  console.log("⚙️  Step 3: Setting up webhook event listeners...");

  sdk.on("webhook:sent", (payload, url) => {
    console.log(`📤 Webhook sent to ${url}`);
    console.log(`   Event: ${payload.event}`);
  });

  sdk.on("webhook:success", (response, url) => {
    console.log(`✅ Webhook delivered successfully to ${url}`);
  });

  sdk.on("webhook:error", (error, url) => {
    console.error(`❌ Webhook delivery failed to ${url}:`);
    console.error(`   Error: ${error.message}`);
  });

  sdk.on("webhook:retry", (attempt, url) => {
    console.log(`🔄 Retrying webhook delivery (attempt ${attempt}) to ${url}`);
  });

  console.log("✅ Webhook event listeners configured\n");

  try {
    // Step 4: Connect to Teneo
    console.log("⚙️  Step 4: Connecting to Teneo network...");
    await sdk.connect();
    console.log("✅ Connected!\n");

    console.log("💡 Tip: While this runs, you can visit:");
    console.log(`   http://localhost:${WEBHOOK_PORT}/health - Check server health`);
    console.log(`   http://localhost:${WEBHOOK_PORT}/webhooks - View all webhooks\n`);

    // Wait for agents
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 5: Trigger events that will send webhooks
    console.log("⚙️  Step 5: Triggering events to test webhook delivery...");
    console.log("   The following actions will trigger webhooks:\n");

    // Get agents (triggers agent:list event)
    console.log("   1. Getting agent list...");
    const agents = sdk.getAgents();
    console.log(`      Found ${agents.length} agents`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send a message (triggers message:sent)
    if (agents.length > 0) {
      const agent = agents.find((a) => a.status === "online") || agents[0];

      console.log(`\n   2. Sending message to ${agent.name || agent.id}...`);
      await sdk.sendDirectCommand(
        {
          agent: agent.id,
          command: "hello webhook test",
          room: DEFAULT_ROOM
        },
        false
      ); // Don't wait for response
      console.log("      Message sent");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Step 6: Check webhook status
    console.log("\n⚙️  Step 6: Checking webhook status...");
    const webhookStatus = sdk.getWebhookStatus();

    console.log("\n📊 Webhook Status:");
    console.log("=".repeat(80));
    console.log(`Configured: ${webhookStatus.configured}`);
    console.log(`URL: ${webhookStatus.config?.url}`);
    console.log(`Pending deliveries: ${webhookStatus.queue.pending}`);
    console.log(`Failed deliveries: ${webhookStatus.queue.failed}`);
    console.log(`Circuit breaker state: ${webhookStatus.queue.circuitState}`);
    console.log("=".repeat(80));

    // Step 7: Demonstrate retry on failure
    console.log("\n⚙️  Step 7: Testing webhook retry behavior...");
    console.log("   Temporarily stopping webhook server to simulate failure...\n");

    // Close server to simulate failure
    server.close();
    console.log("   ⚠️  Webhook server stopped");

    // Try to send a message (webhook will fail and retry)
    console.log("   Triggering event (webhook should fail and retry)...");
    const testAgents = sdk.getAgents();
    if (testAgents.length > 0) {
      await sdk.sendDirectCommand(
        {
          agent: testAgents[0].id,
          command: "test retry",
          room: DEFAULT_ROOM
        },
        false
      );
    }

    // Wait to see retry attempts
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check status again
    const statusAfterFailure = sdk.getWebhookStatus();
    console.log("\n📊 Status after failure:");
    console.log(`   Pending: ${statusAfterFailure.queue.pending}`);
    console.log(`   Failed: ${statusAfterFailure.queue.failed}`);
    console.log(`   Circuit state: ${statusAfterFailure.queue.circuitState}`);

    // Clear failed webhooks
    if (statusAfterFailure.queue.failed > 0) {
      console.log("\n⚙️  Clearing failed webhooks...");
      sdk.clearWebhookQueue();
      console.log("   ✅ Queue cleared");
    }

    console.log("\n💡 Key Points:");
    console.log("   • Webhooks are sent asynchronously (non-blocking)");
    console.log("   • Automatic retry with exponential backoff");
    console.log("   • Circuit breaker prevents cascading failures");
    console.log("   • Failed webhooks can be retried or cleared");
    console.log("   • All events are logged and can be monitored");

    // Display webhook summary
    console.log("\n📊 Webhook Summary:");
    console.log("=".repeat(80));
    console.log(`Total webhooks received: ${webhookCounter}`);

    if (receivedWebhooks.length > 0) {
      console.log("\nWebhook events breakdown:");
      const eventTypes = receivedWebhooks.reduce(
        (acc, wh) => {
          acc[wh.event] = (acc[wh.event] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      Object.entries(eventTypes).forEach(([event, count]) => {
        console.log(`   ${event}: ${count}`);
      });

      console.log("\nRecent webhooks (last 5):");
      receivedWebhooks
        .slice(-5)
        .reverse()
        .forEach((wh, idx) => {
          console.log(
            `   ${idx + 1}. ${wh.event} at ${new Date(wh.receivedAt).toLocaleTimeString()}`
          );
        });
    }
    console.log("=".repeat(80));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    sdk.disconnect();
    sdk.destroy();
    server.close();
    console.log("\n✅ Disconnected and cleaned up");
    console.log("🎉 Example completed!");
  }
}

main().catch(console.error);
