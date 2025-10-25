/**
 * Webhook integration example for Teneo Protocol SDK
 * Demonstrates how to set up webhooks for real-time event streaming
 */

import express from "express";
import { TeneoSDK } from "../src";

// Create Express server to receive webhooks
function createWebhookServer(port: number = 3000) {
  const app = express();
  app.use(express.json());

  // Webhook endpoint
  app.post("/webhook", (req, res) => {
    console.log("\n[WEBHOOK] Webhook received:");
    console.log("  Event:", req.body.event);
    console.log("  Timestamp:", req.body.timestamp);

    const { event, data } = req.body;

    switch (event) {
      case "message":
        console.log(`  [MESSAGE] ${data.content}`);
        break;

      case "agent_selected":
        console.log(`  [AGENT] Agent selected: ${data.agentName}`);
        console.log(`     Reasoning: ${data.reasoning}`);
        break;

      case "task_response":
        console.log(`  [TASK] Task response from ${data.agentName}:`);
        console.log(`     ${data.humanized || data.content}`);
        break;

      case "error":
        console.log(`  [ERROR] Error: ${data.message}`);
        break;

      default:
        console.log("  [DATA] Data:", JSON.stringify(data, null, 2));
    }

    // Acknowledge webhook
    res.json({ status: "success", received: true });
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  const server = app.listen(port, () => {
    console.log(`[WEBHOOK] Webhook server listening on http://localhost:${port}/webhook`);
  });

  return server;
}

async function main() {
  // Start webhook server
  const webhookServer = createWebhookServer(3000);

  // Configure SDK with webhook
  const sdk = new TeneoSDK({
    wsUrl: process.env.WS_URL || "ws://localhost:8080/ws",
    privateKey: process.env.PRIVATE_KEY,
    autoJoinRooms: ["general"],

    // Webhook configuration
    webhookUrl: "http://localhost:3000/webhook",
    webhookHeaders: {
      "X-API-Key": "your-api-key",
      "Content-Type": "application/json"
    },
    webhookRetries: 3,
    webhookTimeout: 5000,
    allowInsecureWebhooks: true, // Allow localhost for development

    // Other settings
    responseFormat: "both",
    includeMetadata: true,
    logLevel: "info"
  });

  // Monitor webhook events
  sdk.on("webhook:sent", (payload, url) => {
    console.log(`[WEBHOOK] Webhook sent to ${url}`);
  });

  sdk.on("webhook:success", (response, url) => {
    console.log(`[WEBHOOK] Webhook acknowledged by ${url}`);
  });

  sdk.on("webhook:error", (error, url) => {
    console.error(`[WEBHOOK] Webhook failed for ${url}:`, error.message);
  });

  sdk.on("webhook:retry", (attempt, url) => {
    console.log(`[WEBHOOK] Retrying webhook to ${url} (attempt ${attempt})`);
  });

  try {
    // Connect to Teneo
    console.log("[SDK] Connecting to Teneo network...");
    await sdk.connect();

    // Wait for ready
    await new Promise<void>((resolve) => {
      sdk.once("ready", resolve);
    });

    console.log("[SDK] Connected and ready!");

    // Send some test messages
    console.log("\n[SDK] Sending test messages...\n");

    // These will trigger webhooks
    await sdk.sendMessage("What is blockchain technology?", { room: "general" });
    await sdk.sendMessage("Explain quantum computing in simple terms", { room: "general" });
    await sdk.sendMessage("How does machine learning work?", { room: "general" });

    // Check webhook queue status
    const webhookStatus = sdk.getWebhookStatus();
    console.log("\n[WEBHOOK] Webhook Status:");
    console.log(`  Configured: ${webhookStatus.configured}`);
    console.log(`  Queue: ${JSON.stringify(webhookStatus.queue)}`);

    // Wait for webhooks to be processed
    console.log("\n[SDK] Processing webhooks for 30 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Retry any failed webhooks
    sdk.retryFailedWebhooks();
  } catch (error) {
    console.error("[ERROR] Error:", error);
  } finally {
    // Clean up
    console.log("\n[SDK] Shutting down...");
    sdk.disconnect();
    sdk.destroy();
    webhookServer.close();
  }
}

// Advanced webhook handler with database integration
class WebhookProcessor {
  private sdk: TeneoSDK;
  private messageBuffer: any[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(sdk: TeneoSDK) {
    this.sdk = sdk;

    // Process buffered messages every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);
  }

  public handleWebhook(payload: any) {
    // Buffer messages
    this.messageBuffer.push({
      ...payload,
      receivedAt: new Date()
    });

    // Process immediately if buffer is large
    if (this.messageBuffer.length >= 100) {
      this.flush();
    }
  }

  private flush() {
    if (this.messageBuffer.length === 0) return;

    console.log(`[PROCESSOR] Processing ${this.messageBuffer.length} buffered webhooks...`);

    // Here you would typically:
    // 1. Save to database
    // 2. Send to message queue
    // 3. Trigger other workflows

    // For this example, just log
    this.messageBuffer.forEach((msg) => {
      this.processMessage(msg);
    });

    // Clear buffer
    this.messageBuffer = [];
  }

  private processMessage(message: any) {
    // Process based on event type
    switch (message.event) {
      case "task_response":
        this.handleTaskResponse(message);
        break;
      case "agent_selected":
        this.handleAgentSelection(message);
        break;
      case "error":
        this.handleError(message);
        break;
      default:
        // Store in database, send notifications, etc.
        console.log(`Processing ${message.event} event`);
    }
  }

  private handleTaskResponse(message: any) {
    // Example: Store response in database
    console.log(`Storing task response: ${message.data.taskId}`);
    // db.saveTaskResponse(message.data);
  }

  private handleAgentSelection(message: any) {
    // Example: Log agent usage metrics
    console.log(`Agent ${message.data.agentId} selected for task`);
    // metrics.recordAgentUsage(message.data.agentId);
  }

  private handleError(message: any) {
    // Example: Send alert
    console.log(`Error alert: ${message.data.message}`);
    // alerting.sendError(message.data);
  }

  public destroy() {
    clearInterval(this.flushInterval);
    this.flush();
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}
