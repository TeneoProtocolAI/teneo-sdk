/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Production Dashboard Example - Hono + Bun
 *
 * A comprehensive example demonstrating ALL Teneo Protocol SDK features:
 * - WebSocket connection with auto-reconnection
 * - Ethereum wallet authentication
 * - Private key encryption in memory (SEC-3)
 * - Message signature verification (SEC-2)
 * - Message deduplication cache (CB-4)
 * - Indexed agent lookups (PERF-3)
 * - Configurable retry strategies (REL-3)
 * - Webhook integration with circuit breaker
 * - Rate limiting
 * - Health monitoring
 * - Real-time event streaming
 * - Complete error handling
 *
 * Run with: bun run server.ts
 */

import { serve } from "@hono/node-server";
import * as fs from "fs";
import { Hono } from "hono";
import * as path from "path";
import type { AgentResponse } from "../../dist/index.js";
import { SDKConfigBuilder, TeneoSDK, SecurePrivateKey } from "../../dist/index.js";

// Load environment variables
const PORT = parseInt(process.env.PORT || "3001");
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "as1LfBarJNzOIpOQJQ7PH";
const ENABLE_SIG_VERIFICATION = process.env.ENABLE_SIGNATURE_VERIFICATION === "true";
const TRUSTED_ADDRESSES = process.env.TRUSTED_ADDRESSES?.split(",").filter(Boolean) || [];

// Create Hono app
const app = new Hono();

// In-memory storage for demo
interface StoredEvent {
  type: string;
  timestamp: string;
  data: any;
}

interface StoredMessage {
  id: string;
  timestamp: string;
  content: string;
  from: string;
  response?: AgentResponse;
}

const recentEvents: StoredEvent[] = [];
const recentMessages: StoredMessage[] = [];
const recentWebhooks: any[] = [];
let messageCounter = 0;
let errorCounter = 0;
let sdk: TeneoSDK | null = null;
const sseClients: Set<ReadableStreamDefaultController> = new Set();

// Initialize SDK with all features
async function initializeSDK() {
  console.log("[SERVER] Initializing Teneo SDK with all features...");

  try {
    // SEC-3: Use encrypted private key in memory
    // This protects the private key from memory dumps and inspection
    const secureKey = new SecurePrivateKey(PRIVATE_KEY);
    console.log("[SDK] Private key encrypted in memory (SEC-3)");

    const config = new SDKConfigBuilder()
      .withWebSocketUrl(WS_URL)
      .withAuthentication(secureKey, WALLET_ADDRESS) // Pass SecurePrivateKey instead of plain string
      .withAutoJoinRooms([DEFAULT_ROOM])
      .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
      // REL-3: Configure custom retry strategies for production resilience
      .withReconnectionStrategy({
        type: "exponential",
        baseDelay: 3000, // Start with 3s instead of default 5s
        maxDelay: 120000, // Max 2 minutes instead of default 1 minute
        maxAttempts: 15, // More attempts for production reliability
        jitter: true, // Prevent thundering herd
        backoffMultiplier: 2.5 // Faster backoff than default 2
      })
      .withWebhookRetryStrategy({
        type: "exponential",
        baseDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 5, // More attempts for webhook reliability
        jitter: false, // Predictable delays for webhooks
        backoffMultiplier: 2
      })
      .withResponseFormat({ format: "both", includeMetadata: true })
      .withLogging("debug")
      .withCache(true, 300000, 100)
      // CB-4: Message deduplication to prevent duplicate processing
      .withMessageDeduplication(
        true, // Enabled by default
        120000, // 2 minute TTL (increased from default 60s for production)
        50000 // 50k message cache (increased from default 10k for high volume)
      )
      .withSignatureVerification({
        enabled: ENABLE_SIG_VERIFICATION,
        trustedAddresses: TRUSTED_ADDRESSES,
        requireFor: ["task_response", "agent_selected"],
        strictMode: false
      })
      .build();

    // Allow localhost webhooks for development
    config.allowInsecureWebhooks = true;

    sdk = new TeneoSDK(config);

    // Configure webhook to point to our server
    sdk.configureWebhook(`http://localhost:${PORT}/webhook`, {
      "X-API-Key": "production-dashboard-secret",
      "Content-Type": "application/json"
    });

    // Set up comprehensive event listeners
    setupSDKEventListeners(sdk);

    // Connect to Teneo network
    console.log("[SDK] Connecting to Teneo network...");
    await sdk.connect();
    console.log("[SDK] Successfully connected and authenticated!");

    return sdk;
  } catch (error) {
    console.error("[SDK] Failed to initialize:", error);
    throw error;
  }
}

// Setup all SDK event listeners
function setupSDKEventListeners(sdk: TeneoSDK) {
  // Connection events
  sdk.on("connection:open", () => {
    addEvent("connection:open", { message: "Connected to WebSocket" });
    broadcastSSE({ type: "connection", status: "connected" });
  });

  sdk.on("connection:close", (code, reason) => {
    addEvent("connection:close", { code, reason });
    broadcastSSE({ type: "connection", status: "disconnected", code, reason });
  });

  sdk.on("connection:reconnecting", (attempt) => {
    addEvent("connection:reconnecting", { attempt });
    broadcastSSE({ type: "connection", status: "reconnecting", attempt });
  });

  sdk.on("connection:reconnected", () => {
    addEvent("connection:reconnected", { message: "Reconnected successfully" });
    broadcastSSE({ type: "connection", status: "reconnected" });
  });

  // Authentication events
  sdk.on("auth:challenge", (challenge) => {
    addEvent("auth:challenge", {
      challenge: challenge.substring(0, 20) + "..."
    });
  });

  sdk.on("auth:success", (state) => {
    addEvent("auth:success", {
      walletAddress: state.walletAddress,
      rooms: state.rooms?.length || 0,
      isWhitelisted: state.isWhitelisted
    });
    broadcastSSE({ type: "auth", status: "success", state });
  });

  sdk.on("auth:error", (error) => {
    addEvent("auth:error", { error });
    errorCounter++;
  });

  // Signature verification events
  sdk.on("signature:verified", (messageType, address) => {
    addEvent("signature:verified", { messageType, address });
  });

  sdk.on("signature:failed", (messageType, reason, address) => {
    addEvent("signature:failed", { messageType, reason, address });
    errorCounter++;
  });

  // Deduplication events (CB-4)
  sdk.on("message:duplicate", (message) => {
    addEvent("message:duplicate", {
      messageType: message.type,
      messageId: message.id,
      from: message.from
    });
    broadcastSSE({
      type: "message:duplicate",
      message: { type: message.type, id: message.id }
    });
  });

  // Agent events
  sdk.on("agent:selected", (data) => {
    addEvent("agent:selected", {
      agentName: data.agentName,
      reasoning: data.reasoning,
      command: data.command
    });
    broadcastSSE({ type: "agent:selected", data });
  });

  sdk.on("agent:response", (response) => {
    addEvent("agent:response", {
      agentName: response.agentName,
      success: response.success,
      contentLength: response.content?.length || 0
    });

    // Update stored message with response
    const msg = recentMessages.find((m) => !m.response);
    if (msg) {
      msg.response = response;
    }

    broadcastSSE({ type: "agent:response", response });
  });

  sdk.on("agent:list", (agents) => {
    addEvent("agent:list", { count: agents.length });
    broadcastSSE({ type: "agent:list", agents });
  });

  // Room events
  sdk.on("room:subscribed", (data) => {
    addEvent("room:subscribed", {
      roomId: data.roomId,
      subscriptions: data.subscriptions
    });
    broadcastSSE({ type: "room:subscribed", data });
  });

  sdk.on("room:unsubscribed", (data) => {
    addEvent("room:unsubscribed", {
      roomId: data.roomId,
      subscriptions: data.subscriptions
    });
    broadcastSSE({ type: "room:unsubscribed", data });
  });

  sdk.on("room:list", (rooms) => {
    addEvent("room:list", { count: rooms.length });
    broadcastSSE({ type: "room:list", rooms });
  });

  // Webhook events
  sdk.on("webhook:sent", (payload, url) => {
    addEvent("webhook:sent", { event: payload.event, url });
  });

  sdk.on("webhook:success", (response, url) => {
    addEvent("webhook:success", { url, status: response.status });
  });

  sdk.on("webhook:error", (error, url) => {
    addEvent("webhook:error", { error: error.message, url });
    errorCounter++;
  });

  sdk.on("webhook:retry", (attempt, url) => {
    addEvent("webhook:retry", { attempt, url });
  });

  // Error events
  sdk.on("error", (error) => {
    addEvent("error", {
      name: error.name,
      message: error.message,
      code: error.code,
      recoverable: error.recoverable
    });
    errorCounter++;
    broadcastSSE({
      type: "error",
      error: { message: error.message, code: error.code }
    });
  });

  sdk.on("warning", (warning) => {
    addEvent("warning", { warning });
  });

  // Lifecycle events
  sdk.on("ready", () => {
    addEvent("ready", { message: "SDK ready" });
    broadcastSSE({ type: "ready" });
  });
}

// Helper functions
function addEvent(type: string, data: any) {
  const event: StoredEvent = {
    type,
    timestamp: new Date().toISOString(),
    data
  };
  recentEvents.unshift(event);
  if (recentEvents.length > 100) recentEvents.pop();
}

function broadcastSSE(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch (error) {
      sseClients.delete(controller);
    }
  });
}

// ===== API ROUTES =====

// Serve dashboard
app.get("/", (c) => {
  const htmlPath = path.join(__dirname, "public", "dashboard.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  return c.html(html);
});

// Health check endpoint
app.get("/health", async (c) => {
  if (!sdk) {
    return c.json({ status: "unhealthy", error: "SDK not initialized" }, 503);
  }

  const health = sdk.getHealth();
  return c.json(health);
});

// Metrics endpoint
app.get("/metrics", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  const connectionState = sdk.getConnectionState();
  const authState = sdk.getAuthState();
  const webhookStatus = sdk.getWebhookStatus();
  const agents = sdk.getAgents();
  const rooms = sdk.getRooms();

  return c.json({
    connection: {
      connected: sdk.isConnected,
      authenticated: sdk.isAuthenticated,
      reconnectAttempts: connectionState.reconnectAttempts
    },
    auth: {
      walletAddress: authState.walletAddress,
      rooms: authState.rooms?.length || 0
    },
    agents: {
      total: agents.length,
      online: agents.filter((a) => a.status === "online").length
    },
    rooms: {
      total: rooms.length,
      subscribedRooms: sdk.getSubscribedRooms()
    },
    webhooks: {
      configured: webhookStatus.configured,
      pending: webhookStatus.queue.pending,
      failed: webhookStatus.queue.failed,
      circuitState: webhookStatus.queue.circuitState
    },
    messages: {
      sent: messageCounter,
      recent: recentMessages.length
    },
    errors: {
      total: errorCounter
    },
    uptime: process.uptime()
  });
});

// CB-4: Deduplication status endpoint
app.get("/api/deduplication", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  const status = sdk.getDeduplicationStatus();

  if (!status) {
    return c.json({
      enabled: false,
      message: "Message deduplication is not enabled"
    });
  }

  return c.json({
    enabled: true,
    ...status,
    utilization: ((status.cacheSize / status.maxSize) * 100).toFixed(2) + "%"
  });
});

// Webhook receiver endpoint
app.post("/webhook", async (c) => {
  const payload = await c.req.json();

  console.log("[WEBHOOK] Received:", payload.event);

  // Store webhook for display
  recentWebhooks.unshift({
    ...payload,
    receivedAt: new Date().toISOString()
  });
  if (recentWebhooks.length > 50) recentWebhooks.pop();

  // Update message with full task response if available
  if (payload.event === "task_response" && payload.data) {
    const msg = recentMessages.find((m) => !m.response || m.response.content?.includes("Started"));
    if (msg) {
      msg.response = {
        taskId: payload.data.taskId,
        agentId: payload.data.agentId,
        agentName: payload.data.agentName || "Agent",
        content: payload.data.content,
        contentType: payload.data.contentType,
        success: payload.data.success !== false,
        timestamp: payload.data.timestamp || new Date().toISOString(),
        humanized: payload.data.humanized || payload.data.content
      };
      broadcastSSE({ type: "message:updated", message: msg });
    }
  }

  // Broadcast to dashboard
  broadcastSSE({ type: "webhook:received", payload });

  return c.json({ status: "success", received: true });
});

// Send message
app.post("/api/message", async (c) => {
  if (!sdk || !sdk.isConnected) {
    return c.json({ error: "SDK not connected" }, 503);
  }

  try {
    const { content, room, waitForResponse = false } = await c.req.json();

    if (!content || typeof content !== "string") {
      return c.json({ error: "Content is required" }, 400);
    }

    if (!room || typeof room !== "string") {
      return c.json({ error: "Room is required" }, 400);
    }

    const messageId = `msg_${Date.now()}`;
    const storedMessage: StoredMessage = {
      id: messageId,
      timestamp: new Date().toISOString(),
      content,
      from: "dashboard"
    };
    recentMessages.unshift(storedMessage);
    if (recentMessages.length > 100) recentMessages.pop();
    messageCounter++;

    const response = await sdk.sendMessage(content, {
      room,
      waitForResponse,
      timeout: 60000
    });

    if (response) {
      storedMessage.response = response as AgentResponse;
    }

    return c.json({
      success: true,
      messageId,
      response: response || null
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Send direct command
app.post("/api/direct-command", async (c) => {
  if (!sdk || !sdk.isConnected) {
    return c.json({ error: "SDK not connected" }, 503);
  }

  try {
    const { agent, command, room } = await c.req.json();

    if (!agent || !command) {
      return c.json({ error: "Agent and command are required" }, 400);
    }

    await sdk.sendDirectCommand({ agent, command, room });

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get agents
app.get("/api/agents", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  const agents = sdk.getAgents();
  return c.json(agents);
});

// PERF-3: Search agents by capability (O(1) indexed lookup)
app.get("/api/agents/search/capability/:capability", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  try {
    const capability = c.req.param("capability");
    const agents = sdk.findAgentsByCapability(capability);
    return c.json({
      capability,
      count: agents.length,
      agents
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// PERF-3: Search agents by name (O(k) token-based lookup)
app.get("/api/agents/search/name/:name", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  try {
    const name = c.req.param("name");
    const agents = sdk.findAgentsByName(name);
    return c.json({
      query: name,
      count: agents.length,
      agents
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// PERF-3: Search agents by status (O(1) indexed lookup)
app.get("/api/agents/search/status/:status", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  try {
    const status = c.req.param("status");
    const agents = sdk.findAgentsByStatus(status);
    return c.json({
      status,
      count: agents.length,
      agents
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Get rooms
app.get("/api/rooms", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  const rooms = sdk.getRooms();
  return c.json(rooms);
});

// Get available rooms for sending messages (subscribed + private room)
app.get("/api/rooms/available", (c) => {
  if (!sdk) {
    return c.json({ error: "SDK not initialized" }, 503);
  }

  const authState = sdk.getAuthState();
  const subscribedRooms = sdk.getSubscribedRooms();

  // Combine all available rooms
  const availableRooms: Array<{
    id: string;
    name: string;
    type: string;
    description?: string;
  }> = [];

  // Add subscribed public rooms
  if (subscribedRooms && subscribedRooms.length > 0) {
    subscribedRooms.forEach((roomId: string) => {
      availableRooms.push({
        id: roomId,
        name: roomId,
        type: "subscribed"
      });
    });
  }

  // Add rooms from auth state (includes both public and private rooms with full details)
  if (authState.roomObjects && authState.roomObjects.length > 0) {
    authState.roomObjects.forEach((room: any) => {
      // Only add if not already in the list
      if (!availableRooms.find((r) => r.id === room.id)) {
        availableRooms.push({
          id: room.id,
          name: room.name || room.id,
          type: room.is_public ? "public" : "private",
          description: room.description
        });
      }
    });
  }

  // Add private room ID if not already included
  if (authState.privateRoomId && !availableRooms.find((r) => r.id === authState.privateRoomId)) {
    availableRooms.push({
      id: authState.privateRoomId,
      name: "My Private Room",
      type: "private"
    });
  }

  return c.json(availableRooms);
});

// List all rooms
app.get("/api/rooms/list", async (c) => {
  if (!sdk || !sdk.isConnected) {
    return c.json({ error: "SDK not connected" }, 503);
  }

  try {
    const rooms = await sdk.listRooms();
    return c.json(rooms);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Join room
app.post("/api/room/join", async (c) => {
  if (!sdk || !sdk.isConnected) {
    return c.json({ error: "SDK not connected" }, 503);
  }

  try {
    const { roomId } = await c.req.json();

    if (!roomId) {
      return c.json({ error: "Room ID is required" }, 400);
    }

    await sdk.subscribeToRoom(roomId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Leave room
app.post("/api/room/leave", async (c) => {
  if (!sdk || !sdk.isConnected) {
    return c.json({ error: "SDK not connected" }, 503);
  }

  try {
    const { roomId } = await c.req.json();

    if (!roomId) {
      return c.json({ error: "Room ID is required" }, 400);
    }

    await sdk.unsubscribeFromRoom(roomId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get recent events
app.get("/api/events", (c) => {
  return c.json(recentEvents.slice(0, 50));
});

// Get recent messages
app.get("/api/messages", (c) => {
  return c.json(recentMessages.slice(0, 20));
});

// Get recent webhooks
app.get("/api/webhooks", (c) => {
  return c.json(recentWebhooks.slice(0, 20));
});

// Server-Sent Events for real-time updates
app.get("/api/sse", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      sseClients.add(controller);

      // Send initial connection and auth status
      if (sdk) {
        const connectionStatus = sdk.isConnected ? "connected" : "disconnected";
        const authStatus = sdk.isAuthenticated ? "success" : "pending";

        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "connection", status: connectionStatus })}\n\n`
          )
        );
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "auth", status: authStatus })}\n\n`
          )
        );
      }

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
          sseClients.delete(controller);
        }
      }, 30000);

      return () => {
        clearInterval(keepAlive);
        sseClients.delete(controller);
      };
    },
    cancel() {
      sseClients.delete(this as any);
    }
  });

  return c.newResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
});

// Start server
async function startServer() {
  try {
    // Initialize SDK first
    await initializeSDK();

    // Start HTTP server
    console.log(`[SERVER] Starting Hono server on port ${PORT}...`);

    serve({
      fetch: app.fetch,
      port: PORT
    });

    console.log(`\n🚀 Production Dashboard running!`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`❤️  Health: http://localhost:${PORT}/health`);
    console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
    console.log(`\nPress Ctrl+C to stop\n`);
  } catch (error) {
    console.error("[SERVER] Failed to start:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SERVER] Shutting down gracefully...");

  if (sdk) {
    sdk.disconnect();
    sdk.destroy();
  }

  sseClients.clear();

  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on("SIGTERM", () => {
  console.log("\n[SERVER] Received SIGTERM, shutting down...");

  if (sdk) {
    sdk.disconnect();
    sdk.destroy();
  }

  sseClients.clear();
  process.exit(0);
});

// Start the server
startServer();
