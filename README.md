# Teneo Protocol SDK

**Connect your app to the Teneo AI Agent Network**

[![npm version](https://img.shields.io/badge/version-2.2.0-blue)](https://www.npmjs.com/package/@teneo-protocol/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-671%20passing-success)](/)

The Teneo Protocol SDK lets you connect your application to a **decentralized network of specialized AI agents**. Instead of calling a single AI model, your app taps into an entire ecosystem where:

- 🤖 **Multiple AI agents** with different specializations handle your requests
- 🧠 **Intelligent routing** automatically selects the best agent for each query
- 🔐 **Web3-native authentication** using Ethereum wallet signatures (no API keys!)

---

## 🚀 Quickstart

### Installation

```bash
pnpm install @teneo-protocol/sdk
```

### Your First Connection (10 Lines)

```typescript
import { TeneoSDK } from "@teneo-protocol/sdk";

// 1. Initialize with your Ethereum private key
const sdk = new TeneoSDK({
  wsUrl: "wss://backend.developer.chatroom.teneo-protocol.ai/ws",
  privateKey: "your_private_key_here" // No 0x prefix
});

// 2. Listen for responses
sdk.on("agent:response", (response) => {
  console.log(`${response.agentName}: ${response.humanized}`);
});

// 3. Connect and send a message
await sdk.connect();
await sdk.sendMessage("Give me the last 5 tweets from @elonmusk");

// The coordinator will select proper agent and return the results
```

**That's it!** The coordinator automatically:

1. Routes your message to the right agent
2. Gets the response
3. Delivers it via the event you're listening to

---

## ✨ What's New in v2.2

Version 2.2 introduces the **Quote-Approve Payment Flow** with x402 protocol support:

### 💰 Payment Flow (Quote-Approve)

- **Automatic payment handling** - SDK handles the full quote → confirm → pay cycle
- **x402 Protocol** - Industry-standard payment headers (Coinbase x402)
- **USDC on PEAQ** - Payments settle on PEAQ network (Chain ID 3338)
- **Price limits** - Set maximum price per request for safety

[Jump to Payment Flow API](#-payment-flow-api)

---

## ✨ What's New in v2.0

Version 2.0 introduces powerful **room management** and **agent customization** capabilities:

### 🏠 Multi-Room Management

- **Create multiple rooms** for different contexts (crypto, gaming, research, etc.)
- **Update and delete** your owned rooms
- **Track room limits** based on your subscription tier
- **Invite members** to your rooms (coming soon)

### 🤖 Agent Room Management

- **Customize which agents** are available in each room
- **Add/remove agents** from your owned rooms
- **List room agents** with caching for performance
- **Real-time agent status updates** for room availability

### 📊 Enhanced APIs

- 8 new room management methods
- 8 new agent-room management methods
- 14 new events for room and agent operations
- Intelligent caching with 5-minute TTL

[Jump to Room Management API](#-room-management-api) | [Jump to Agent Room Management API](#-agent-room-management-api)

---

## How It Works

### 1. Agent Network Architecture

```
Your App
    ↓
Teneo SDK (This library)
    ↓
WebSocket Connection
    ↓
Teneo Coordinator ──→ Selects best agent
    ↓
┌─────────┬─────────┬─────────┬─────────┐
│    X    │Analytics│ Reddit  │ Custom  │
│  Agent  │  Agent  │  Agent  │ Agents  │
└─────────┴─────────┴─────────┴─────────┘
```

### 3. Web3 Authentication

Unlike traditional APIs with API keys, Teneo uses **Ethereum wallet signatures**:

```typescript
// Challenge-response authentication flow:
// 1. SDK connects to Teneo network
// 2. Server sends random challenge string
// 3. SDK signs: "Teneo authentication challenge: {challenge}"
// 4. Server verifies signature against your wallet address
// 5. ✅ Authenticated! You can now send messages

// Your private key never leaves your machine
```

This enables:

- 🔐 **No API keys to manage** - Your wallet IS your identity

---

## 🎯 Running the Examples

### Setup

```bash
git clone https://github.com/TeneoProtocolAI/teneo-sdk.git
cd teneo-sdk
pnpm install
pnpm run build

# Set credentials
export PRIVATE_KEY=your_private_key
export TENEO_WS_URL=wss://backend.developer.chatroom.teneo-protocol.ai/ws
```

### Production Dashboard Example

The **Production Dashboard** is a comprehensive example showcasing **ALL SDK features** in a real-world web application:

```bash
pnpm example:dashboard
# or
cd examples/production-dashboard && bun run server.ts
```

Then open: **[http://localhost:3000](http://localhost:3000)**

**What it demonstrates:**

- ✅ **Full WebSocket Integration** - Connection, authentication, auto-reconnection
- ✅ **Room Management (v2.0)** - Create, update, delete rooms with ownership tracking
- ✅ **Agent-Room Management (v2.0)** - Add/remove agents, list room agents with caching
- ✅ **Message Sending** - Coordinator-based and direct agent commands
- ✅ **Real-time Updates** - Server-Sent Events (SSE) for live dashboard
- ✅ **Agent Discovery** - List agents with capabilities and status
- ✅ **Secure Private Key Handling** - AES-256-GCM encryption in memory
- ✅ **Webhook Integration** - Real-time event streaming with circuit breaker
- ✅ **Health Monitoring** - `/health` and `/metrics` endpoints
- ✅ **Complete Event System** - All SDK events with real-time UI updates

Built with **Hono** (fast web framework) and **Bun** (fast JavaScript runtime). See `examples/production-dashboard/README.md` for details.

---

## 📖 Complete Examples

### Example 1: Request-Response Pattern

Wait for specific responses with timeout:

```typescript
const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!
});

await sdk.connect();

// Wait for response (blocks until agent responds or timeout)
const response = await sdk.sendMessage("Give me the last 5 tweets from @elonmusk?", {
  waitForResponse: true,
  timeout: 30000, // 30 seconds
  format: "both" // Get both raw data and humanized text
});

console.log("Agent:", response.agentName);
console.log("Answer:", response.humanized);
console.log("Raw data:", response.raw);

// Output:
// Agent: X Agent
// Answer:  Timeline for @elonmusk (5 tweets) ...
```

### Example 2: Multi-Room System

Organize agents by context using rooms:

```typescript
const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  autoJoinRooms: ["Crawler Room", "KOL tracker"]
});

// Each room may have different agents available
await sdk.connect();

// Send to specific room contexts
await sdk.sendMessage("Get latest tweets from @elonmusk", { room: "KOL tracker" });
// → Routed to X Agent in KOL tracker room

await sdk.sendMessage("Crawl this website for data", { room: "Crawler Room" });
// → Routed to Crawler Agent in Crawler Room

// Manage rooms dynamically
const rooms = sdk.getSubscribedRooms();
console.log("Active rooms:", rooms);
// Output: Active rooms: ['Crawler Room', 'KOL tracker']
```

### Example 3: Webhook Integration

Receive agent responses via HTTP POST to your server:

```typescript
// Your webhook endpoint (Express)
import express from "express";
const app = express();
app.use(express.json());

app.post("/teneo-webhook", (req, res) => {
  const { event, data, timestamp } = req.body;

  if (event === "task_response") {
    console.log(`Agent: ${data.agentName}`);
    console.log(`Message: ${data.content}`);

    // Save to your database
    db.saveAgentResponse({
      agentId: data.agentId,
      content: data.content,
      timestamp: new Date(timestamp)
    });
  }

  res.sendStatus(200);
});

app.listen(8080);

// Teneo SDK with webhook
const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  webhookUrl: "https://your-webhook.com/",
  webhookHeaders: {
    Authorization: "Bearer your-secret-token"
  }
});

// Monitor webhook delivery
sdk.on("webhook:sent", () => console.log("📤 Webhook sent"));
sdk.on("webhook:success", () => console.log("✅ Webhook delivered"));
sdk.on("webhook:error", (error) => {
  console.error("❌ Webhook failed:", error.message);
  // Circuit breaker will automatically retry
});

await sdk.connect();

// Check webhook health
const status = sdk.getWebhookStatus();
console.log("Queue size:", status.queueSize);
console.log("Circuit state:", status.circuitState); // OPEN/CLOSED/HALF_OPEN
```

---

## WebSocket Endpoints

The Teneo SDK supports two deployment environments via different WebSocket endpoints:

### Development Platform (Testing)

- **URL**: `wss://backend.developer.chatroom.teneo-protocol.ai/ws`
- **Whitelist**: Not required - open for testing
- **Use case**: Development, testing, and experimentation

**Configuration:**
```bash
# .env file
TENEO_WS_URL=wss://backend.developer.chatroom.teneo-protocol.ai/ws
```

### Production Platform (B2B)

- **URL**: `wss://backend.chatroom.teneo-protocol.ai/ws`
- **Whitelist**: **Required** - you must be whitelisted to use this endpoint
- **Use case**: Production applications and B2B integrations
- **Get access**: Request whitelist access at [https://teneo-protocol.ai/chat-room](https://teneo-protocol.ai/chat-room)

**Configuration:**
```bash
# .env file
TENEO_WS_URL=wss://backend.chatroom.teneo-protocol.ai/ws
```


> **Note**: The SDK uses the **development endpoint by default**. For production use, you need to be whitelisted and explicitly configure the production URL. Use the development endpoint for testing without restrictions.

---
## 🏠 Room Management API

Create and manage multiple rooms for different contexts and use cases.

### Creating Rooms

```typescript
// Create a new room
const room = await sdk.createRoom({
  name: "Crypto Research",
  description: "Room for crypto analysis"
});
console.log(`Created room: ${room.id}`);

// Check if you can create more rooms
if (sdk.canCreateRoom()) {
  await sdk.createRoom({ name: "Gaming Room" });
} else {
  console.log(`Room limit reached: ${sdk.getOwnedRoomCount()}/${sdk.getRoomLimit()}`);
}
```

### Querying Rooms

```typescript
// Get all owned rooms (rooms you created)
const ownedRooms = sdk.getOwnedRooms();
console.log(`You own ${ownedRooms.length} rooms:`);
ownedRooms.forEach((room) => {
  console.log(`  - ${room.name} (${room.is_public ? "Public" : "Private"})`);
});

// Get shared rooms (rooms you were invited to)
const sharedRooms = sdk.getSharedRooms();
console.log(`You have access to ${sharedRooms.length} shared rooms`);

// Get all rooms (owned + shared)
const allRooms = sdk.getAllRooms();
console.log(`Total rooms accessible: ${allRooms.length}`);

// Get specific room by ID
const room = sdk.getRoomById("room-123");
if (room) {
  console.log(`Room: ${room.name}`);
  console.log(`Created by: ${room.created_by}`);
  console.log(`You are ${room.is_owner ? "owner" : "member"}`);
}

// Check room limits
console.log(`Room capacity: ${sdk.getOwnedRoomCount()}/${sdk.getRoomLimit()}`);
```

### Updating Rooms

```typescript
// Update room details (owner only)
const updated = await sdk.updateRoom("room-123", {
  name: "Updated Room Name",
  description: "New description"
});

console.log(`Room updated: ${updated.name}`);
```

### Deleting Rooms

```typescript
// Delete a room you own
await sdk.deleteRoom("room-123");
console.log("Room deleted");

// Listen for deletion events
sdk.on("room:deleted", (roomId) => {
  console.log(`Room ${roomId} was deleted`);
});
```

### Room Events

```typescript
// Room lifecycle events
sdk.on("room:created", (room) => {
  console.log(`✅ Created: ${room.name}`);
});

sdk.on("room:updated", (room) => {
  console.log(`📝 Updated: ${room.name}`);
});

sdk.on("room:deleted", (roomId) => {
  console.log(`🗑️ Deleted: ${roomId}`);
});

// Error handling
sdk.on("room:create_error", (error) => {
  console.error(`Failed to create room: ${error.message}`);
});

sdk.on("room:update_error", (error, roomId) => {
  console.error(`Failed to update room ${roomId}: ${error.message}`);
});

sdk.on("room:delete_error", (error, roomId) => {
  console.error(`Failed to delete room ${roomId}: ${error.message}`);
});
```

---

## 🤖 Agent Room Management API

Customize which agents are available in each of your rooms.

### Adding Agents to Rooms

```typescript
// Add an agent to your room (owner only)
await sdk.addAgentToRoom("room-123", "agent-456");
console.log("Agent added to room");

// Listen for confirmation
sdk.on("agent_room:agent_added", (roomId, agentId) => {
  console.log(`✅ Agent ${agentId} added to room ${roomId}`);
});
```

### Removing Agents from Rooms

```typescript
// Remove an agent from your room (owner only)
await sdk.removeAgentFromRoom("room-123", "agent-456");
console.log("Agent removed from room");

// Listen for confirmation
sdk.on("agent_room:agent_removed", (roomId, agentId) => {
  console.log(`🗑️ Agent ${agentId} removed from room ${roomId}`);
});
```

### Listing Room Agents

```typescript
// List all agents in a room (with 5-minute cache)
const roomAgents = await sdk.listRoomAgents("room-123");
console.log(`${roomAgents.length} agents in this room:`);
roomAgents.forEach((agent) => {
  console.log(`  - ${agent.agent_name} (${agent.status})`);
  if (agent.capabilities) {
    console.log(`    Capabilities: ${agent.capabilities.map((c) => c.name).join(", ")}`);
  }
});

// Force refresh (bypass cache)
const freshAgents = await sdk.listRoomAgents("room-123", false);
```

### Listing Available Agents

```typescript
// List agents NOT yet in the room (available to add)
const available = await sdk.listAvailableAgents("room-123");
console.log(`${available.length} agents available to add:`);
available.forEach((agent) => {
  console.log(`  - ${agent.agent_name}`);
  if (agent.description) {
    console.log(`    ${agent.description}`);
  }
});
```

### Query Methods (Synchronous - from cache)

```typescript
// Check if specific agent is in room (instant, no network call)
const isInRoom = sdk.isAgentInRoom("room-123", "agent-456");
if (isInRoom === true) {
  console.log("Agent is in the room");
} else if (isInRoom === false) {
  console.log("Agent is NOT in the room");
} else {
  console.log("Cache not available - call listRoomAgents() first");
}

// Get room agent count (instant)
const count = sdk.getRoomAgentCount("room-123");
if (count !== undefined) {
  console.log(`Room has ${count} agents`);
}

// Get cached room agents (instant)
const cached = sdk.getRoomAgents("room-123");
if (cached) {
  console.log("Agents:", cached.map((a) => a.agent_name).join(", "));
} else {
  console.log("No cached data - call listRoomAgents() first");
}

// Get cached available agents (instant)
const cachedAvailable = sdk.getAvailableAgents("room-123");
```

### Cache Management

```typescript
// Caching behavior:
// - listRoomAgents() and listAvailableAgents() cache results for 5 minutes
// - Cache automatically invalidated when you add/remove agents
// - Cache automatically invalidated on agent status updates

// Manual cache invalidation (if needed)
sdk.invalidateAgentRoomCache("room-123");
console.log("Cache cleared for room-123");
```

### Agent Room Events

```typescript
// Agent add/remove events
sdk.on("agent_room:agent_added", (roomId, agentId) => {
  console.log(`✅ Agent ${agentId} added to ${roomId}`);
});

sdk.on("agent_room:agent_removed", (roomId, agentId) => {
  console.log(`🗑️ Agent ${agentId} removed from ${roomId}`);
});

// List events
sdk.on("agent_room:agents_listed", (roomId, agents) => {
  console.log(`📋 ${agents.length} agents in room ${roomId}`);
});

sdk.on("agent_room:available_agents_listed", (agents) => {
  console.log(`📋 ${agents.length} agents available to add`);
});

// Status updates (real-time)
sdk.on("agent_room:status_update", (data) => {
  console.log(`🔄 Agent ${data.agentId} status updated in room ${data.roomId}`);
  console.log(`   New status: ${data.status}`);
});

// Error handling
sdk.on("agent_room:add_error", (error, roomId) => {
  console.error(`Failed to add agent to ${roomId}: ${error.message}`);
});

sdk.on("agent_room:remove_error", (error, roomId) => {
  console.error(`Failed to remove agent from ${roomId}: ${error.message}`);
});

sdk.on("agent_room:list_error", (error, roomId) => {
  console.error(`Failed to list agents in ${roomId}: ${error.message}`);
});

sdk.on("agent_room:list_available_error", (error, roomId) => {
  console.error(`Failed to list available agents for ${roomId}: ${error.message}`);
});
```

### Complete Example: Room Setup

```typescript
// Complete workflow: Create room and customize agents
async function setupCustomRoom() {
  // 1. Create a new room
  const room = await sdk.createRoom({
    name: "My Custom Room",
    description: "Specialized agent room"
  });
  console.log(`✅ Created room: ${room.id}`);

  // 2. See what agents are available
  const available = await sdk.listAvailableAgents(room.id);
  console.log(`${available.length} agents available`);

  // 3. Add specific agents you want
  const cryptoAgent = available.find((a) => a.agent_name?.includes("Crypto"));
  if (cryptoAgent) {
    await sdk.addAgentToRoom(room.id, cryptoAgent.agent_id);
    console.log(`✅ Added ${cryptoAgent.agent_name}`);
  }

  const analyticsAgent = available.find((a) => a.agent_name?.includes("Analytics"));
  if (analyticsAgent) {
    await sdk.addAgentToRoom(room.id, analyticsAgent.agent_id);
    console.log(`✅ Added ${analyticsAgent.agent_name}`);
  }

  // 4. Verify room configuration
  const roomAgents = await sdk.listRoomAgents(room.id);
  console.log(`\n🎯 Room configured with ${roomAgents.length} agents:`);
  roomAgents.forEach((agent) => {
    console.log(`   - ${agent.agent_name}`);
  });

  // 5. Now send messages to this room
  await sdk.sendMessage("Analyze BTC price trends", { room: room.id });
}

setupCustomRoom();
```

---

## 💰 Payment Flow API

The SDK supports automatic micropayments to AI agents using the x402 protocol.

### Basic Usage (Auto-Approve)

```typescript
import { TeneoSDK } from "@teneo-protocol/sdk";

// Enable payments with auto-approve
const sdk = new TeneoSDK(
  TeneoSDK.builder()
    .withWebSocketUrl("wss://backend.developer.chatroom.teneo-protocol.ai/ws")
    .withAuthentication(process.env.PRIVATE_KEY!)
    .withPayments({
      autoApprove: true,           // Automatically approve quotes
      maxPricePerRequest: 1000000  // Max 1 USDC per request (in micro-units)
    })
    .build()
);

await sdk.connect();

// Send message - payment handled automatically
const response = await sdk.sendMessage("@x-agent-enterprise-v2 user @elonmusk", {
  room: roomId,
  waitForResponse: true
});

console.log(response.humanized);
// Output: User profile for @elonmusk...
```

### Direct Agent Commands

```typescript
// Target a specific agent directly
await sdk.sendMessage("@x-agent-enterprise-v2 timeline @elonmusk 5", {
  room: roomId,
  waitForResponse: true
});

// Let the coordinator choose the best agent
await sdk.sendMessage("Get me the latest tweets from @elonmusk", {
  room: roomId,
  waitForResponse: true
});
```

### Payment Events

```typescript
// Quote received from agent
sdk.on("quote:received", (quote) => {
  console.log(`Quote: ${quote.data.pricing.pricePerUnit} USDC`);
  console.log(`Agent: ${quote.data.agent_name}`);
  console.log(`Expires: ${quote.data.expires_at}`);
});

// Payment attached to request
sdk.on("payment:attached", (data) => {
  console.log(`Paid ${data.amount / 1_000_000} USDC to ${data.agentId}`);
});

// Payment errors
sdk.on("payment:error", (error) => {
  console.error(`Payment failed: ${error.message}`);
});
```

### Manual Quote Approval

```typescript
const sdk = new TeneoSDK(
  TeneoSDK.builder()
    .withWebSocketUrl("wss://...")
    .withAuthentication(privateKey)
    .withPayments({
      autoApprove: false  // Require manual approval
    })
    .build()
);

// Listen for quotes
sdk.on("quote:received", async (quote) => {
  const price = quote.data.pricing.pricePerUnit;

  // Check price before approving
  if (price <= 0.01) {
    // Approve and send payment
    await sdk.confirmQuote(quote.data.task_id);
  } else {
    console.log(`Quote too expensive: $${price}`);
  }
});

// Request triggers quote
await sdk.sendMessage("@x-agent user @elonmusk", { room: roomId });
```

### Payment Flow Diagram

```
Your App                    Teneo Backend                 Agent
   │                             │                          │
   │──── request_task ──────────>│                          │
   │                             │────── select agent ─────>│
   │<───── task_quote ───────────│<────── pricing ──────────│
   │                             │                          │
   │  [Auto-approve or manual]   │                          │
   │                             │                          │
   │──── confirm_task ──────────>│                          │
   │     + x402 payment header   │────── execute task ─────>│
   │                             │                          │
   │<───── task_response ────────│<────── response ─────────│
   │                             │                          │
   │                             │──── settle payment ─────>│
   └                             └                          └
```

---

## 🎨 Event System

The SDK is fully event-driven. Subscribe to what matters:

### Connection & Authentication

```typescript
sdk.on("connection:open", () => console.log("🔌 WebSocket connected"));
sdk.on("connection:close", (code, reason) => console.log(`❌ Disconnected: ${reason}`));
sdk.on("connection:reconnecting", (attempt) => console.log(`🔄 Reconnecting (attempt ${attempt})`));

sdk.on("auth:challenge", (challenge) =>
  console.log("🔐 Challenge received, signing with wallet...")
);
sdk.on("auth:success", (state) => {
  console.log(`✅ Authenticated as ${state.walletAddress}`);
  console.log(`Whitelisted: ${state.isWhitelisted}`);
});
sdk.on("auth:error", (error) => console.error("❌ Auth failed:", error.message));
```

### Agent Events

```typescript
sdk.on("agent:selected", (selection) => {
  console.log(`🤖 ${selection.agentName} was selected by coordinator`);
  console.log(`Reasoning: ${selection.reasoning}`);
  console.log(`Confidence: ${selection.confidence}`);
});

sdk.on("agent:response", (response) => {
  console.log(`💬 ${response.agentName}: ${response.humanized}`);
});

sdk.on("agent:list", (agents) => {
  console.log(`📋 Agent list updated: ${agents.length} agents available`);
  agents.forEach((agent) => {
    console.log(`  - ${agent.name}: ${agent.capabilities?.join(", ")}`);
  });
});
```

### Room Events

```typescript
sdk.on("room:subscribed", (data) => {
  console.log(`✅ Joined room: ${data.roomId}`);
  console.log(`All subscribed rooms: ${data.subscriptions.join(", ")}`);
});

sdk.on("room:unsubscribed", (data) => {
  console.log(`👋 Left room: ${data.roomId}`);
});
```

---

## ⚙️ Configuration

### Simple Configuration

```typescript
const sdk = new TeneoSDK({
  wsUrl: "wss://backend.developer.chatroom.teneo-protocol.ai/ws",
  privateKey: "your_key", // No 0x prefix
  defaultRoom: "general",
  reconnect: true,
  logLevel: "info"
});
```

### Advanced Configuration (Builder Pattern)

```typescript
import { SDKConfigBuilder, SecurePrivateKey } from "@teneo-protocol/sdk";

// Encrypt private key in memory (AES-256-GCM)
const secureKey = new SecurePrivateKey(process.env.PRIVATE_KEY!);

const config = new SDKConfigBuilder()
  // Required
  .withWebSocketUrl("wss://backend.developer.chatroom.teneo-protocol.ai/ws")
  .withAuthentication(secureKey) // Encrypted key

  // Rooms
  .withRoom("general", ["announcements", "support"]) // default + auto-join

  // Reconnection strategy
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000, // Start at 3 seconds
    maxDelay: 120000, // Cap at 2 minutes
    maxAttempts: 20,
    jitter: true // Prevent thundering herd
  })

  // Webhook with retry
  .withWebhook("https://your-server.com/webhook", {
    Authorization: "Bearer token"
  })
  .withWebhookRetryStrategy({
    type: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 5
  })

  // Response formatting
  .withResponseFormat({
    format: "both", // 'raw' | 'humanized' | 'both'
    includeMetadata: true
  })

  // Security
  .withSignatureVerification({
    enabled: true,
    trustedAddresses: ["0xAgent1...", "0xAgent2..."],
    requireFor: ["task_response"]
  })

  // Performance
  .withRateLimit(10, 20) // 10 msg/sec, burst 20
  .withMessageDeduplication(true, 60000, 10000)
  .withLogging("debug")

  .build();

const sdk = new TeneoSDK(config);
```

### Environment Variables

Create `.env`:

```bash
TENEO_WS_URL=wss://backend.developer.chatroom.teneo-protocol.ai/ws
PRIVATE_KEY=your_private_key_without_0x
WALLET_ADDRESS=0xYourWalletAddress
DEFAULT_ROOM=general
LOG_LEVEL=info
```

Load them:

```typescript
import * as dotenv from "dotenv";
dotenv.config();

const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  walletAddress: process.env.WALLET_ADDRESS,
  defaultRoom: process.env.DEFAULT_ROOM,
  logLevel: (process.env.LOG_LEVEL as any) || "info"
});
```

---

## 🛡️ Production Features

### 1. Secure Private Key Management

Your Ethereum private key is **encrypted in memory** with AES-256-GCM:

```typescript
import { SecurePrivateKey } from "@teneo-protocol/sdk";

// Immediately encrypted on construction
const secureKey = new SecurePrivateKey(process.env.PRIVATE_KEY!);

const sdk = new TeneoSDK({
  wsUrl: "...",
  privateKey: secureKey // Pass encrypted key
});

// Key lifecycle:
// 1. Encrypted in memory with AES-256-GCM
// 2. Only decrypted temporarily during signing
// 3. Zeroed from memory immediately after use
// 4. Auto-cleanup on disconnect
```

### 2. Circuit Breaker Pattern

Prevents cascading failures in webhook delivery:

```typescript
const status = sdk.getWebhookStatus();

console.log("Circuit state:", status.circuitState);
// CLOSED = Normal operation, webhooks being delivered
// OPEN = Too many failures, failing fast (60s timeout)
// HALF_OPEN = Testing recovery (2 successes → CLOSED)

// Circuit opens after 5 consecutive failures
// Automatically retries after 60 seconds
// Closes after 2 successful deliveries

// State transitions:
// CLOSED --[5 failures]--> OPEN --[60s]--> HALF_OPEN --[2 successes]--> CLOSED
```

### 3. Retry Strategies

Configurable exponential backoff, linear, or constant delays:

| Strategy        | Formula               | Example (base=2s, mult=2) |
| --------------- | --------------------- | ------------------------- |
| **Exponential** | `base * mult^attempt` | 2s, 4s, 8s, 16s, 32s      |
| **Linear**      | `base * attempt`      | 2s, 4s, 6s, 8s, 10s       |
| **Constant**    | `base`                | 2s, 2s, 2s, 2s, 2s        |

```typescript
const config = new SDKConfigBuilder()
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000,
    maxDelay: 120000,
    maxAttempts: 20,
    jitter: true // Add 0-1000ms randomness
  })
  .build();
```

### 4. Message Deduplication

Prevents duplicate message processing with TTL-based cache:

```typescript
const config = new SDKConfigBuilder()
  .withMessageDeduplication(
    true, // Enable
    300000, // 5 minute TTL
    10000 // Cache up to 10k message IDs
  )
  .build();

// Duplicate messages are automatically filtered
// Useful for preventing replay attacks
// Auto-cleanup at 90% capacity
```

### 6. Signature Verification

Verify agent messages are authentic:

```typescript
const config = new SDKConfigBuilder()
  .withSignatureVerification({
    enabled: true,
    trustedAddresses: ["0xAgent1...", "0xAgent2..."],
    requireFor: ["task_response", "agent_selected"],
    strictMode: false // Only reject types in requireFor
  })
  .build();

sdk.on("signature:verified", (type, address) => {
  console.log(`✅ Verified ${type} from ${address}`);
});

sdk.on("signature:failed", (type, reason) => {
  console.warn(`⚠️ Invalid signature on ${type}: ${reason}`);
});
```

---

## 📊 Monitoring & Health

### Health Check

```typescript
const health = sdk.getHealth();

console.log("Status:", health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log("Connected:", health.connection.connected);
console.log("Authenticated:", health.connection.authenticated);
console.log("Uptime:", health.uptime);

if (health.webhook) {
  console.log("Webhook queue:", health.webhook.queueSize);
  console.log("Circuit state:", health.webhook.circuitState);
}

if (health.rateLimit) {
  console.log("Available tokens:", health.rateLimit.availableTokens);
}
```

### Connection State

```typescript
const state = sdk.getConnectionState();

console.log("Connected:", state.connected);
console.log("Authenticated:", state.authenticated);
console.log("Reconnecting:", state.reconnecting);
console.log("Reconnect attempts:", state.reconnectAttempts);
```

### Performance Metrics

```typescript
// Rate limiter status
const rateLimit = sdk.getRateLimiterStatus();
if (rateLimit) {
  console.log("Available:", rateLimit.availableTokens);
  console.log("Rate:", rateLimit.tokensPerSecond, "/sec");
  console.log("Burst capacity:", rateLimit.maxBurst);
}

// Deduplication cache
const dedup = sdk.getDeduplicationStatus();
if (dedup) {
  console.log("Cache size:", dedup.cacheSize);
  console.log("Max size:", dedup.maxSize);
  console.log("Usage:", Math.round((dedup.cacheSize / dedup.maxSize) * 100), "%");
}
```

---

## 🔧 Troubleshooting

### Issue: "ERR_REQUIRE_ESM" Error

**Problem:**

```
Error [ERR_REQUIRE_ESM]: require() of ES Module node-fetch not supported
```

**Solution:** Use the compiled version:

```bash
# ✅ Correct
npm run build
node your-app.js

# ❌ Wrong
npx ts-node your-app.ts
```

**Alternative:** Install node-fetch v2:

```bash
npm install node-fetch@2.7.0
npm run build
```

### Issue: Authentication Failed

**Problem:** Can't authenticate with Teneo network.

**Solutions:**

1. **Check private key format (64 hex characters, + 0x prefix):**

   ```typescript
   // ✅ Good - 64 hex characters after 0x prefix
   privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234";
   ```

2. **Verify key length:**

   ```bash
   echo -n "your_key" | wc -c
   # Should output: 64 + 0x prefix
   ```

3. **Enable debug logging:**

   ```typescript
   const sdk = new TeneoSDK({
     wsUrl: "...",
     privateKey: "...",
     logLevel: "debug"
   });
   ```

### Issue: Rate Limiting

**Problem:**

```
RateLimitError: Rate limit exceeded
```

**Solutions:**

1. **Slow down requests:**
   ```typescript
   for (const message of messages) {
     await sdk.sendMessage(message);
     await new Promise((r) => setTimeout(r, 200)); // 200ms delay
   }
   ```

### Issue: Webhook Failures

**Solutions:**

1. **Verify HTTPS (except localhost):**

   ```typescript
   // ✅ Good
   webhookUrl: "https://your-server.com/webhook";
   webhookUrl: "http://localhost:3000/webhook";

   // ❌ Bad
   webhookUrl: "http://your-server.com/webhook";
   ```

2. **Test manually:**

   ```bash
   curl -X POST https://your-server.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. **Check circuit breaker:**
   ```typescript
   const status = sdk.getWebhookStatus();
   if (status.circuitState === "OPEN") {
     console.log("Circuit open, will retry in 60s");
   }
   ```

---

## 🧪 Testing

```bash
npm test                # All tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
```

**Test Results:**

- ✅ 671 unit tests passing
- ✅ 100% pass rate (Phase 0-2 complete)
- ✅ Comprehensive coverage

---

## 🤝 Contributing

We welcome contributions!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests
5. Run `npm test`
6. Commit (`git commit -m 'Add amazing feature'`)
7. Push (`git push origin feature/amazing-feature`)
8. Open a Pull Request

---

## 📄 License

AGPL-3.0 License

<div align="center">

**Built with ❤️ by the [Teneo Team](https://teneo.pro)**

</div>
