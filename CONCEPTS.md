# Teneo SDK - Core Concepts

This guide explains how the Teneo Protocol works under the hood. Understanding these concepts will help you build better applications.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rooms](#rooms)
- [The Coordinator](#the-coordinator)
- [Agents](#agents)
- [Message Flow](#message-flow)
- [Payments (X402)](#payments-x402)
- [Events](#events)
- [Connection Lifecycle](#connection-lifecycle)

---

## Overview

The Teneo Protocol connects your application to a network of AI agents through a WebSocket connection. Here's the high-level architecture:

```
Your Application
      │
      ▼
┌─────────────────┐
│   Teneo SDK     │  ◄── You are here
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│  Teneo Server   │
│  ┌───────────┐  │
│  │Coordinator│  │  ◄── Selects the best agent for each request
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │  Agents   │  │  ◄── Specialized AI agents (weather, analytics, etc.)
│  └───────────┘  │
└─────────────────┘
```

**Key Components:**
- **SDK**: Handles connection, authentication, and message routing
- **Coordinator**: Server-side AI that analyzes your message and picks the best agent
- **Agents**: Specialized AI agents that handle specific tasks
- **Rooms**: Isolated spaces where you interact with agents

---

## Authentication

Teneo uses **Web3 wallet authentication** instead of API keys. Your Ethereum private key proves your identity through cryptographic signatures.

### How It Works

```
1. SDK connects to server
         │
         ▼
2. Server sends random challenge
   "Please sign: abc123xyz..."
         │
         ▼
3. SDK signs challenge with your private key
   signature = sign("Teneo authentication challenge: abc123xyz...")
         │
         ▼
4. SDK sends signature + wallet address
         │
         ▼
5. Server verifies signature matches address
         │
         ▼
6. Authenticated! Server sends your rooms, limits, etc.
```

### Why Wallet Auth?

- **No API keys to leak** - Your identity is your wallet
- **Cryptographically secure** - Signatures can't be forged
- **Web3 native** - Works with existing Ethereum wallets
- **Your private key never leaves your machine** - Only signatures are sent

### Code Example

```typescript
const sdk = new TeneoSDK({
  wsUrl: "wss://backend.developer.chatroom.teneo-protocol.ai/ws",
  privateKey: "0xYourPrivateKey" // Used only for signing
});

// For production, use SecurePrivateKey for memory encryption
import { SecurePrivateKey } from "@teneo-protocol/sdk";
const secureKey = new SecurePrivateKey(process.env.PRIVATE_KEY);

const sdk = new TeneoSDK({
  wsUrl: "...",
  privateKey: secureKey // Encrypted in RAM, decrypted only when signing
});
```

### Events

```typescript
sdk.on("auth:challenge", (challenge) => {
  // Challenge received, SDK will sign automatically
});

sdk.on("auth:success", (state) => {
  console.log(`Authenticated as ${state.walletAddress}`);
  console.log(`You have ${state.rooms.length} rooms`);
});

sdk.on("auth:error", (error) => {
  console.error("Authentication failed:", error);
});
```

---

## Rooms

Rooms are isolated spaces where you send messages and receive responses from agents. Think of them as chat channels or conversation contexts.

### Room Types

| Type | Subscription | Ownership | Use Case |
|------|-------------|-----------|----------|
| **Private** | Automatic | You own it | Personal workspace, private conversations |
| **Public** | Manual (`subscribeToRoom()`) | System/shared | Community channels, announcements |
| **Shared** | Automatic | Someone invited you | Collaboration, team rooms |

### Private Rooms

- **You create them** with `createRoom()`
- **You're always subscribed** - no need to call `subscribeToRoom()`
- **You control agents** - add/remove agents as needed
- **Subject to limits** - typically 1-10 rooms based on your plan

```typescript
// Check if you can create more rooms
if (sdk.canCreateRoom()) {
  const room = await sdk.createRoom({
    name: "My Research Room",
    description: "For crypto analysis"
  });
  console.log(`Created room: ${room.id}`);
}

// Check your limits
console.log(`Rooms: ${sdk.getOwnedRoomCount()}/${sdk.getRoomLimit()}`);
```

### Public Rooms

- **System-created** or community channels
- **Require explicit subscription** to receive messages
- **Shared agents** - you can't modify the agent list

```typescript
// Subscribe to a public room
await sdk.subscribeToRoom("public-room-id");

// Unsubscribe when done
await sdk.unsubscribeFromRoom("public-room-id");
```

### Room Lifecycle

```typescript
// 1. Create a room
const room = await sdk.createRoom({ name: "My Room" });

// 2. Add agents to customize it
const available = await sdk.listAvailableAgents(room.id);
await sdk.addAgentToRoom(room.id, available[0].agent_id);

// 3. Send messages
await sdk.sendMessage("Hello!", { room: room.id });

// 4. Update room details (owner only)
await sdk.updateRoom(room.id, { name: "Renamed Room" });

// 5. Delete when done (owner only)
await sdk.deleteRoom(room.id);
```

### Room Events

```typescript
sdk.on("room:created", (room) => console.log(`Created: ${room.name}`));
sdk.on("room:updated", (room) => console.log(`Updated: ${room.name}`));
sdk.on("room:deleted", (roomId) => console.log(`Deleted: ${roomId}`));
sdk.on("room:subscribed", (data) => console.log(`Subscribed to: ${data.roomId}`));
sdk.on("room:unsubscribed", (data) => console.log(`Left: ${data.roomId}`));
```

---

## The Coordinator

The Coordinator is the brain of the Teneo Protocol. It analyzes your message and selects the most appropriate agent to handle it.

### How Agent Selection Works

```
Your Message: "What's the weather in Tokyo?"
                    │
                    ▼
            ┌───────────────┐
            │  Coordinator  │
            │               │
            │ Analyzes:     │
            │ - Intent      │
            │ - Keywords    │
            │ - Context     │
            └───────┬───────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Weather │ │Analytics│ │  News   │
   │  Agent  │ │  Agent  │ │  Agent  │
   │ ✓ MATCH │ │    ✗    │ │    ✗    │
   └─────────┘ └─────────┘ └─────────┘
        │
        ▼
   Weather Agent processes request
        │
        ▼
   Response: "Tokyo: 22°C, Partly cloudy"
```

### Coordinator Events

```typescript
sdk.on("agent:selected", (selection) => {
  console.log(`Selected: ${selection.agentName}`);
  console.log(`Reason: ${selection.reasoning}`);
  console.log(`Capabilities: ${selection.capabilities?.map(c => c.name).join(", ")}`);
});
```

### Bypassing the Coordinator

Use **direct commands** when you know exactly which agent you want:

```typescript
// Regular message - Coordinator selects agent
await sdk.sendMessage("What's the weather?", { room: roomId });

// Direct command - Bypass coordinator, go straight to agent
await sdk.sendDirectCommand({
  agent: "weather-agent",
  command: "forecast Tokyo",
  room: roomId
});
```

### When to Use Direct Commands

| Use Coordinator | Use Direct Command |
|-----------------|-------------------|
| General questions | Specific agent tasks |
| "Help me with..." | "Agent X, do Y" |
| Don't know which agent | Know the exact agent |
| Want intelligent routing | Want predictable routing |

---

## Agents

Agents are specialized AI services that handle specific tasks. Each agent has:

- **Capabilities**: What it can do (e.g., "weather-forecast", "crypto-analysis")
- **Commands**: Specific actions it supports
- **Pricing**: Free or paid per task

### Agent Visibility in Rooms

Agents must be **assigned to a room** to respond to messages in that room.

```typescript
// List agents currently in your room
const roomAgents = await sdk.listRoomAgents(roomId);

// List agents you can add to your room
const availableAgents = await sdk.listAvailableAgents(roomId);

// Add an agent to your room (owner only)
await sdk.addAgentToRoom(roomId, "weather-agent-001");

// Remove an agent from your room
await sdk.removeAgentFromRoom(roomId, "weather-agent-001");
```

### Getting Agent Details

```typescript
const details = await sdk.getAgentDetails("weather-agent-001");

console.log(`Name: ${details.agent_name}`);
console.log(`Description: ${details.description}`);
console.log(`Status: ${details.status}`);

// Capabilities
details.capabilities?.forEach(cap => {
  console.log(`- ${cap.name}: ${cap.description}`);
});

// Commands
details.commands?.forEach(cmd => {
  console.log(`- ${cmd.name}: ${cmd.description}`);
});

// Pricing (per command, if paid agent)
details.commands?.forEach(cmd => {
  if (cmd.pricing) {
    console.log(`${cmd.trigger}: ${cmd.pricing.pricePerUnit} per ${cmd.pricing.taskUnit}`);
  }
});
```

### Agent Events

```typescript
sdk.on("agent:selected", (data) => {
  console.log(`${data.agentName} selected for your request`);
});

sdk.on("agent:response", (response) => {
  console.log(`${response.agentName}: ${response.content}`);
});

sdk.on("agent:list", (agents) => {
  console.log(`${agents.length} agents available`);
});

sdk.on("agent_room:agent_added", (roomId, agentId) => {
  console.log(`Agent ${agentId} added to room ${roomId}`);
});

sdk.on("agent_room:agent_removed", (roomId, agentId) => {
  console.log(`Agent ${agentId} removed from room ${roomId}`);
});
```

---

## Message Flow

Understanding how messages flow through the system helps you debug and optimize your application.

### Complete Flow: sendMessage to Response

```
sdk.sendMessage("What's 2+2?", { room: roomId })
         │
         ▼
┌─────────────────────────────────────┐
│ 1. SDK validates                    │
│    - Connected? ✓                   │
│    - Room specified? ✓              │
│    - Content not empty? ✓           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 2. Create message                   │
│    {                                │
│      type: "message",               │
│      content: "What's 2+2?",        │
│      room: roomId,                  │
│      from: "0xYourWallet"           │
│    }                                │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 3. Send over WebSocket              │
│    - Rate limit check               │
│    - Emit "message:sent" event      │
└─────────────────┬───────────────────┘
                  │
         ════════════════ Network ═══════
                  │
                  ▼
┌─────────────────────────────────────┐
│ 4. Server receives message          │
│    - Coordinator analyzes           │
│    - Selects Math Agent             │
│    - Emits "agent:selected"         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 5. Agent processes                  │
│    - Math Agent calculates          │
│    - Sends response                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 6. SDK receives response            │
│    - Parse task_response            │
│    - Emit "agent:response" event    │
└─────────────────────────────────────┘
```

### Fire-and-Forget vs Wait-for-Response

**Fire-and-Forget** (Default):
```typescript
// Returns immediately after sending
await sdk.sendMessage("Hello", { room: roomId });

// Handle response via event
sdk.on("agent:response", (response) => {
  console.log(response.content);
});
```

**Wait-for-Response**:
```typescript
// Blocks until response received or timeout
const response = await sdk.sendMessage("What's 2+2?", {
  room: roomId,
  waitForResponse: true,
  timeout: 30000 // 30 seconds
});

console.log(response.content); // "4"
```

### When to Use Each

| Fire-and-Forget | Wait-for-Response |
|-----------------|-------------------|
| Chat interfaces | Request-response APIs |
| Real-time updates | Sequential operations |
| Multiple concurrent requests | Single request at a time |
| Non-blocking UX | Need the response to continue |

---

## Payments (X402)

Some agents charge for their services using the X402 payment protocol. The flow is: **Quote → Confirm → Response**.

### Automatic Payment Signing

The SDK includes a `PaymentSigner` that **automatically creates x402 payment headers** when you confirm a task. No manual payment encoding needed!

- Uses **PEAQ chain** with **USDC** stablecoin
- Payment headers are signed using your private key
- The SDK handles all the complexity for you

### Payment Flow

```
1. Request a Quote
   "How much to analyze this data?"
              │
              ▼
2. Agent Returns Quote
   {
     task_id: "task_123",
     agent: "DataAnalyst",
     price: $0.05,
     expires: "in 5 minutes"
   }
              │
              ▼
3. Confirm Task
   SDK auto-signs the payment!
              │
              ▼
4. Server Validates Payment
              │
              ▼
5. Agent Executes Task
              │
              ▼
6. Response Delivered
   "Here's your analysis..."
```

### API Reference

#### `requestQuote(content, room)` → `Promise<QuoteResult>`

Requests a price quote from the coordinator without auto-approval.

```typescript
const quote = await sdk.requestQuote(
  "Analyze Bitcoin trends for the past week",
  roomId
);
```

**Returns `QuoteResult`:**
```typescript
{
  taskId: string;       // Unique task identifier
  agentId: string;      // Selected agent ID
  agentName: string;    // Agent display name
  agentWallet: string;  // Agent's payment wallet address
  command: string;      // The command to be executed
  pricing: {
    pricePerUnit: number;  // Price in micro-USDC
    priceType: string;     // e.g., "per_request"
    currency: string;      // e.g., "USDC"
    timeUnit?: string;     // e.g., "hour", "day"
    network?: string;      // e.g., "peaq"
  };
  expiresAt: Date;      // Quote expiration time
}
```

#### `confirmQuote(taskId, options?)` → `Promise<FormattedResponse | void>`

Confirms a pending quote and executes the task with payment. The SDK auto-signs the x402 payment header.

```typescript
// Fire and forget
await sdk.confirmQuote(quote.taskId);

// Wait for the agent's response
const response = await sdk.confirmQuote(quote.taskId, {
  waitForResponse: true,  // Block until agent responds
  timeout: 30000          // Timeout in ms (default: 30000)
});

console.log(response.humanized);
```

#### `getPendingQuote(taskId)` → `QuoteResult | undefined`

Retrieves a pending quote that hasn't been confirmed yet.

```typescript
const quote = sdk.getPendingQuote("task-123");
if (quote) {
  console.log(`Pending: ${quote.agentName} at ${quote.pricing.pricePerUnit} USDC`);
}
```

### Complete Payment Example

```typescript
import { TeneoSDK } from "@teneo-protocol/sdk";

const sdk = new TeneoSDK(
  TeneoSDK.builder()
    .withWebSocketUrl("wss://backend.developer.chatroom.teneo-protocol.ai/ws")
    .withAuthentication(process.env.PRIVATE_KEY!)
    .withPayments({
      autoApprove: false,          // Manual approval
      maxPricePerRequest: 1000000  // Max 1 USDC (in micro-units)
    })
    .build()
);

await sdk.connect();

// Get a room to work with
const rooms = sdk.getRooms();
const roomId = rooms[0].id;

// 1. Request a quote
const quote = await sdk.requestQuote(
  "Analyze Bitcoin trends for the past week",
  roomId
);

console.log(`Agent: ${quote.agentName}`);
console.log(`Price: ${quote.pricing.pricePerUnit} micro-USDC`);
console.log(`Expires: ${quote.expiresAt}`);

// 2. Check price and confirm
if (quote.pricing.pricePerUnit <= 500000) {
  // Confirm and wait for the response
  const response = await sdk.confirmQuote(quote.taskId, {
    waitForResponse: true,
    timeout: 30000
  });

  console.log("Result:", response.humanized);
} else {
  console.log("Too expensive, skipping");
}

sdk.disconnect();
```

### Payment Events

```typescript
// Quote received from agent
sdk.on("quote:received", (quote) => {
  console.log(`Quote: ${quote.data.pricing.pricePerUnit} USDC`);
  console.log(`Expires: ${quote.data.expires_at}`);
});

// Quote expired before confirmation
sdk.on("quote:expired", (taskId) => {
  console.warn(`Quote expired: ${taskId}`);
});

// Payment attached to request
sdk.on("payment:attached", (data) => {
  console.log(`Paid ${data.amount} to agent ${data.agentId}`);
});

// Payment blocked by price limit
sdk.on("payment:blocked", (data) => {
  console.warn(`Blocked: agent charges ${data.agentPrice}, max is ${data.maxPrice}`);
});

// Payment errors
sdk.on("payment:error", (error) => {
  console.error(`Payment failed: ${error.message}`);
});
```

### Configuration

Payment behavior can be configured two ways:

```typescript
// Builder pattern
TeneoSDK.builder()
  .withPayments({
    autoApprove: true,           // Auto-confirm quotes
    maxPricePerRequest: 1000000, // Max 1 USDC per request
    quoteTimeout: 30000          // 30s timeout for quotes
  })
  .build();

// Plain config object
new TeneoSDK({
  wsUrl: "wss://...",
  privateKey: "0x...",
  autoApproveQuotes: true,       // Same as autoApprove in builder
  maxPricePerRequest: 1000000,
  quoteTimeout: 30000
});
```

> **Note:** `autoApprove` (builder) and `autoApproveQuotes` (config object) control the same behavior.

### Free vs Paid Tasks

- **Free**: Message → Coordinator → Agent → Response (direct)
- **Paid**: Message → Coordinator → Quote → Confirm → Agent → Response

You'll know it's a paid task when you receive a `quote:received` event instead of going directly to `agent:response`.

---

## Events

The SDK is fully event-driven. Here's the complete event reference:

### Connection Events

| Event | When | Data |
|-------|------|------|
| `connection:open` | WebSocket connected | - |
| `connection:close` | WebSocket closed | `(code, reason)` |
| `connection:error` | Connection error | `(error)` |
| `connection:reconnecting` | Attempting reconnect | `(attempt)` |
| `connection:reconnected` | Reconnect successful | - |

### Authentication Events

| Event | When | Data |
|-------|------|------|
| `auth:challenge` | Challenge received | `(challenge)` |
| `auth:success` | Authenticated | `(authState)` |
| `auth:error` | Auth failed | `(error)` |

### Message Events

| Event | When | Data |
|-------|------|------|
| `message:sent` | Message sent | `(message)` |
| `message:received` | Message received | `(message)` |
| `message:error` | Message error | `(error, message)` |

### Agent Events

| Event | When | Data |
|-------|------|------|
| `agent:selected` | Coordinator selected agent | `(selection)` |
| `agent:response` | Agent responded | `(response)` |
| `agent:list` | Agent list received | `(agents)` |

### Room Events

| Event | When | Data |
|-------|------|------|
| `room:created` | Room created | `(room)` |
| `room:updated` | Room updated | `(room)` |
| `room:deleted` | Room deleted | `(roomId)` |
| `room:subscribed` | Subscribed to room | `(data)` |
| `room:unsubscribed` | Unsubscribed from room | `(data)` |

### Payment Events

| Event | When | Data |
|-------|------|------|
| `quote:received` | Quote received | `(quote)` |
| `quote:expired` | Quote expired | `(taskId)` |
| `payment:attached` | Payment attached to request | `(data)` |
| `payment:blocked` | Payment blocked (price too high) | `(data)` |
| `payment:error` | Payment error | `(error)` |

### Lifecycle Events

| Event | When | Data |
|-------|------|------|
| `ready` | SDK ready to use | - |
| `disconnect` | Disconnected | - |
| `destroy` | SDK destroyed | - |
| `error` | General error | `(error)` |

### Event Order on Connect

```
1. connection:open     ─── WebSocket connected
2. auth:challenge      ─── Challenge received
3. auth:success        ─── Authenticated
4. ready               ─── SDK ready
```

### Event Order on Message (Free Agent)

```
1. message:sent        ─── Your message sent
2. agent:selected      ─── Coordinator picked agent (optional)
3. agent:response      ─── Agent responded
```

### Event Order on Message (Paid Agent)

```
1. message:sent        ─── Your message sent
2. agent:selected      ─── Coordinator picked agent
3. quote:received      ─── Quote received
   ... user confirms payment ...
4. payment:attached    ─── Payment attached and validated
5. agent:response      ─── Agent responded
```

---

## Connection Lifecycle

### States

```
┌──────────────┐
│ DISCONNECTED │◄──────────────────────────────┐
└──────┬───────┘                               │
       │ connect()                             │
       ▼                                       │
┌──────────────┐                               │
│  CONNECTING  │                               │
└──────┬───────┘                               │
       │ WebSocket opens                       │
       ▼                                       │
┌──────────────┐                               │
│AUTHENTICATING│                               │
└──────┬───────┘                               │
       │ auth:success                          │
       ▼                                       │
┌──────────────┐     disconnect()              │
│  CONNECTED   │───────────────────────────────┤
└──────┬───────┘                               │
       │ connection lost                       │
       ▼                                       │
┌──────────────┐     max attempts reached      │
│ RECONNECTING │───────────────────────────────┘
└──────┬───────┘
       │ reconnect success
       ▼
┌──────────────┐
│  CONNECTED   │
└──────────────┘
```

### Checking State

```typescript
// Connection state
const connState = sdk.getConnectionState();
console.log(`Connected: ${connState.connected}`);
console.log(`Authenticated: ${connState.authenticated}`);
console.log(`Reconnecting: ${connState.reconnecting}`);
console.log(`Reconnect attempts: ${connState.reconnectAttempts}`);

// Auth state
const authState = sdk.getAuthState();
console.log(`Wallet: ${authState.walletAddress}`);
console.log(`Rooms: ${authState.rooms?.length}`);
console.log(`Room limit: ${authState.maxPrivateRooms}`);
console.log(`Is admin: ${authState.isAdmin}`);

// Health check
const health = sdk.getHealth();
console.log(`Status: ${health.status}`); // 'healthy' | 'degraded' | 'unhealthy'
```

### Reconnection

The SDK automatically reconnects with exponential backoff:

```typescript
const sdk = new TeneoSDK({
  wsUrl: "...",
  privateKey: "...",
  reconnect: true,                    // Enable auto-reconnect
  reconnectDelay: 5000,               // Start with 5s delay
  maxReconnectAttempts: 10            // Give up after 10 attempts
});

// Or use advanced configuration
const sdk = new TeneoSDK({
  wsUrl: "...",
  privateKey: "...",
  reconnectStrategy: {
    type: "exponential",
    baseDelay: 3000,                  // 3s initial
    maxDelay: 120000,                 // 2 minute max
    maxAttempts: 20,
    jitter: true                      // Random variation to avoid thundering herd
  }
});

// Monitor reconnection
sdk.on("connection:reconnecting", (attempt) => {
  console.log(`Reconnecting... attempt ${attempt}`);
});

sdk.on("connection:reconnected", () => {
  console.log("Reconnected successfully!");
});
```

### Graceful Shutdown

```typescript
// Disconnect cleanly
sdk.disconnect();

// Or destroy completely (removes all listeners)
sdk.destroy();
```

---

## Next Steps

- **[README.md](./README.md)** - Quick start and API reference
- **[Examples](./examples/)** - Working code examples
- **[API Reference](./docs/api.md)** - Full API documentation

---

**Built by the [Teneo Protocol Team](https://teneo-protocol.ai)**
