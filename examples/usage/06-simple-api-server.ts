/**
 * Example 6: Simple API Server
 *
 * This example demonstrates:
 * - Building a REST API server using Express that wraps the SDK
 * - Exposing SDK functionality via HTTP endpoints
 * - Managing SDK lifecycle in a server context
 * - Error handling and health checks
 * - Production-ready server patterns
 *
 * Run: npx tsx examples/usage/06-simple-api-server.ts
 * Then use curl or Postman to test:
 *   curl http://localhost:3000/health
 *   curl http://localhost:3000/agents
 *   curl -X POST http://localhost:3000/message -H "Content-Type: application/json" -d '{"message":"hello","agent":"agent-id"}'
 */

import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import { TeneoSDK, SDKConfigBuilder } from "../../dist/index.js";

// Load configuration from environment
const WS_URL =
  process.env.WS_URL || "wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || "general";
const PORT = parseInt(process.env.PORT || "3000");

// Validate configuration
if (!PRIVATE_KEY) {
  console.error("❌ ERROR: PRIVATE_KEY environment variable is required\n");
  process.exit(1);
}

// Initialize Express app
const app = express();
app.use(express.json());

// Build SDK
console.log("🚀 Initializing Teneo API Server\n");
console.log("📋 Configuration:");
console.log(`   WebSocket: ${WS_URL}`);
console.log(`   Room: ${DEFAULT_ROOM}`);
console.log(`   Port: ${PORT}\n`);

const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY)
  // .withAutoJoinRooms([DEFAULT_ROOM])
  .withResponseFormat({ format: "both", includeMetadata: true })
  .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
  .withLogging("info")
  .build();

const sdk = new TeneoSDK(config);

// Track SDK state
let isReady = false;

// SDK event listeners
sdk.on("auth:success", (state) => {
  console.log(`✅ Authenticated as ${state.walletAddress}`);
  isReady = true;
});

sdk.on("connection:close", () => {
  console.log("⚠️  Connection closed");
  isReady = false;
});

sdk.on("connection:reconnecting", (attempt) => {
  console.log(`🔄 Reconnecting... (attempt ${attempt})`);
});

sdk.on("error", (error) => {
  console.error("❌ SDK Error:", error.message);
});

// Connect to Teneo
console.log("🔌 Connecting to Teneo network...");
await sdk.connect();
console.log("✅ Connected!\n");

// Wait for agents to load
await new Promise((resolve) => setTimeout(resolve, 1000));

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /health
 * Health check endpoint - returns SDK and server status
 */
app.get("/health", (_req: Request, res: Response) => {
  const health = sdk.getHealth();

  res.json({
    status: health.status,
    server: {
      ready: isReady,
      uptime: process.uptime()
    },
    teneo: {
      connected: health.connection.status === "connected",
      authenticated: health.connection.authenticated,
      reconnectAttempts: health.connection.reconnectAttempts,
      agents: health.agents.count,
      rooms: health.rooms.count,
      subscribedRooms: health.rooms.subscribedRooms
    }
  });
});

/**
 * GET /agents
 * List all available agents
 */
app.get("/agents", (_req: Request, res: Response) => {
  try {
    const agents = sdk.getAgents();

    res.json({
      success: true,
      count: agents.length,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        capabilities: agent.capabilities,
        commands: agent.commands
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /agents/:id
 * Get specific agent by ID
 */
app.get("/agents/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = sdk.getAgent(id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `Agent ${id} not found`
      });
    }

    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        capabilities: agent.capabilities,
        commands: agent.commands
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /agents/capability/:capability
 * Find agents by capability
 */
app.get("/agents/capability/:capability", (req: Request, res: Response) => {
  try {
    const { capability } = req.params;
    const agents = sdk.findAgentsByCapability(capability);

    res.json({
      success: true,
      capability,
      count: agents.length,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * POST /message
 * Send a message to an agent
 * Body: { message: string, agent?: string, waitForResponse?: boolean, timeout?: number }
 */
app.post("/message", async (req: Request, res: Response) => {
  try {
    const { message, agent, waitForResponse = false, timeout = 30000 } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    if (!isReady) {
      return res.status(503).json({
        success: false,
        error: "SDK is not ready yet"
      });
    }

    const startTime = Date.now();

    if (agent) {
      // Send to specific agent
      const response = await sdk.sendDirectCommand(
        {
          agent,
          command: message,
          room: DEFAULT_ROOM
        },
        waitForResponse
      );

      if (waitForResponse && response) {
        res.json({
          success: true,
          agent,
          response: {
            humanized: response.humanized,
            raw: response.raw,
            metadata: response.metadata
          },
          duration: Date.now() - startTime
        });
      } else {
        res.json({
          success: true,
          agent,
          message: "Message sent (no response requested)",
          duration: Date.now() - startTime
        });
      }
    } else {
      // Send via coordinator (will auto-select agent)
      const response = await sdk.sendMessage(message, {
        room: DEFAULT_ROOM,
        waitForResponse,
        timeout
      });

      if (waitForResponse && response) {
        res.json({
          success: true,
          response: {
            humanized: response.humanized,
            raw: response.raw,
            metadata: response.metadata
          },
          duration: Date.now() - startTime
        });
      } else {
        res.json({
          success: true,
          message: "Message sent to coordinator (no response requested)",
          duration: Date.now() - startTime
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /rooms
 * List subscribed rooms
 */
app.get("/rooms", (_req: Request, res: Response) => {
  try {
    const rooms = sdk.getSubscribedRooms();

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * POST /rooms/:roomId/subscribe
 * Subscribe to a room
 */
app.post("/rooms/:roomId/subscribe", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    await sdk.subscribeToRoom(roomId);

    res.json({
      success: true,
      message: `Subscribed to room ${roomId}`,
      subscribedRooms: sdk.getSubscribedRooms()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * POST /rooms/:roomId/unsubscribe
 * Unsubscribe from a room
 */
app.post("/rooms/:roomId/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    await sdk.unsubscribeFromRoom(roomId);

    res.json({
      success: true,
      message: `Unsubscribed from room ${roomId}`,
      subscribedRooms: sdk.getSubscribedRooms()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, () => {
  console.log("🚀 Teneo API Server running!\n");
  console.log("📡 Endpoints:");
  console.log(`   GET    http://localhost:${PORT}/health`);
  console.log(`   GET    http://localhost:${PORT}/agents`);
  console.log(`   GET    http://localhost:${PORT}/agents/:id`);
  console.log(`   GET    http://localhost:${PORT}/agents/capability/:capability`);
  console.log(`   POST   http://localhost:${PORT}/message`);
  console.log(`   GET    http://localhost:${PORT}/rooms`);
  console.log(`   POST   http://localhost:${PORT}/rooms/:roomId/subscribe`);
  console.log(`   POST   http://localhost:${PORT}/rooms/:roomId/unsubscribe`);
  console.log("\n📝 Example requests:");
  console.log(`   curl http://localhost:${PORT}/health`);
  console.log(`   curl http://localhost:${PORT}/agents`);
  console.log(
    `   curl -X POST http://localhost:${PORT}/message -H "Content-Type: application/json" -d '{"message":"hello","waitForResponse":true}'`
  );
  console.log("\n✅ Server ready to accept requests!\n");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down gracefully...");

  server.close(() => {
    console.log("✅ HTTP server closed");
  });

  sdk.disconnect();
  sdk.destroy();
  console.log("✅ SDK disconnected");

  process.exit(0);
});
