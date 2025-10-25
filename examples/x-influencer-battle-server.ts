/**
 * X Influencer Battle Server
 * WebSocket server that connects frontend to Teneo AI Network
 */

import { TeneoSDK, SDKConfigBuilder } from "../src";
import * as WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const PORT = 3000;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
const ROOM = process.env.ROOM || "";
const WS_URL = process.env.WS_URL || "";

// Create HTTP server to serve the HTML file
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const htmlPath = path.join(__dirname, "x-influencer-battle-redesign.html");
    fs.readFile(htmlPath, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Error loading page");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store SDK instance
let sdk: TeneoSDK | null = null;
let isConnected = false;

// Store pending requests
const pendingRequests = new Map<string, WebSocket>();

// Initialize SDK
async function initSDK() {
  console.log("[SERVER] Initializing Teneo SDK...");

  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)
    .withAutoJoinRooms([ROOM]) // Auto-join rooms on connect
    .withReconnection(true, 5000, 10) // Enable reconnection
    .withResponseFormat("both", true) // Get both raw and humanized responses with metadata
    .withLogging("debug") // Enable debug logging
    .build();
  sdk = new TeneoSDK(config);

  // Set up event listeners
  sdk.on("connection:open", () => {
    console.log("[SDK] Connected to Teneo network");
  });

  sdk.on("auth:success", (state) => {
    console.log("[SDK] Authenticated as:", state.walletAddress);
    isConnected = true;
  });

  sdk.on("agent:selected", (data) => {
    console.log("[SDK] Agent selected:", data.agentName);
  });

  sdk.on("agent:response", (response) => {
    console.log("[SDK] Received agent response");
    handleAgentResponse(response);
  });

  sdk.on("error", (error) => {
    console.error("[SDK] Error:", error.message);
  });

  // Connect to network
  try {
    await sdk.connect();
    console.log("[SDK] Successfully connected and ready");
  } catch (error) {
    console.error("[SDK] Failed to connect:", error);
  }
}

// Handle agent responses
function handleAgentResponse(response: any) {
  console.log("[RESPONSE] Processing agent response");

  // Find which client requested this
  for (const [username, client] of pendingRequests.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      // Send response to client
      const message = {
        type: "timeline_response",
        username: username,
        content: response.content || response.humanized || "",
        agentId: response.agentId,
        success: response.success
      };

      console.log(
        `[RESPONSE] Sending to client for @${username}, length: ${message.content.length}`
      );
      client.send(JSON.stringify(message));

      // Remove from pending
      pendingRequests.delete(username);
    }
  }
}

// Handle WebSocket connections from frontend
wss.on("connection", (ws: WebSocket) => {
  console.log("[WS] New client connected");

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("[WS] Received message:", data);

      if (data.action === "fetch_timeline") {
        const username = data.username;

        if (!isConnected || !sdk) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Not connected to Teneo network"
            })
          );
          return;
        }

        // Store this request
        pendingRequests.set(username, ws);

        // Send command to Teneo
        const command = `timeline @${username} 20`;
        console.log(`[SDK] Sending command: ${command}`);

        try {
          await sdk.sendMessage(command, {
            room: ROOM,
            waitForResponse: false
          });
        } catch (error: any) {
          console.error("[SDK] Error sending message:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: error.message || "Failed to send command"
            })
          );
          pendingRequests.delete(username);
        }
      }
    } catch (error: any) {
      console.error("[WS] Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format"
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("[WS] Client disconnected");
    // Clean up pending requests for this client
    for (const [username, client] of pendingRequests.entries()) {
      if (client === ws) {
        pendingRequests.delete(username);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("[WS] WebSocket error:", error);
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`[SERVER] HTTP server running at http://localhost:${PORT}`);
  console.log(`[SERVER] WebSocket server running at ws://localhost:${PORT}`);
  console.log(`[SERVER] Open http://localhost:${PORT} in your browser`);

  // Initialize SDK
  await initSDK();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SERVER] Shutting down...");
  if (sdk) {
    sdk.disconnect();
    sdk.destroy();
  }
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});
