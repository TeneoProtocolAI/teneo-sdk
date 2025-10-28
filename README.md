# Teneo Protocol SDK

**Connect your app to the Teneo AI Agent Network**

[![npm version](https://img.shields.io/badge/version-1.0.0-blue)](https://www.npmjs.com/package/@teneo-protocol/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-488%20passing-success)](/)

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
  wsUrl: "wss://developer.chatroom.teneo-protocol.ai/ws",
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
export TENEO_WS_URL=wss://developer.chatroom.teneo-protocol.ai/ws
```

### Basic Usage Example

```bash
npx ts-node examples/basic-usage.ts
```

Demonstrates:
- ✅ Connection and authentication
- ✅ Agent discovery
- ✅ Room management
- ✅ Sending messages
- ✅ Event listeners
- ✅ Secure private key handling


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
const response = await sdk.sendMessage(
  "Give me the last 5 tweets from @elonmusk?",
  {
    waitForResponse: true,
    timeout: 30000, // 30 seconds
    format: "both"  // Get both raw data and humanized text
  }
);

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
    "Authorization": "Bearer your-secret-token"
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

## 🎨 Event System

The SDK is fully event-driven. Subscribe to what matters:

### Connection & Authentication

```typescript
sdk.on("connection:open", () => console.log("🔌 WebSocket connected"));
sdk.on("connection:close", (code, reason) => console.log(`❌ Disconnected: ${reason}`));
sdk.on("connection:reconnecting", (attempt) => console.log(`🔄 Reconnecting (attempt ${attempt})`));

sdk.on("auth:challenge", (challenge) => console.log("🔐 Challenge received, signing with wallet..."));
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
  agents.forEach(agent => {
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
  wsUrl: "wss://developer.chatroom.teneo-protocol.ai/ws",
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
  .withWebSocketUrl("wss://developer.chatroom.teneo-protocol.ai/ws")
  .withAuthentication(secureKey) // Encrypted key

  // Rooms
  .withRoom("general", ["announcements", "support"]) // default + auto-join

  // Reconnection strategy
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000,          // Start at 3 seconds
    maxDelay: 120000,         // Cap at 2 minutes
    maxAttempts: 20,
    jitter: true              // Prevent thundering herd
  })

  // Webhook with retry
  .withWebhook("https://your-server.com/webhook", {
    "Authorization": "Bearer token"
  })
  .withWebhookRetryStrategy({
    type: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 5
  })

  // Response formatting
  .withResponseFormat({
    format: "both",           // 'raw' | 'humanized' | 'both'
    includeMetadata: true
  })

  // Security
  .withSignatureVerification({
    enabled: true,
    trustedAddresses: ["0xAgent1...", "0xAgent2..."],
    requireFor: ["task_response"]
  })

  // Performance
  .withRateLimit(10, 20)    // 10 msg/sec, burst 20
  .withMessageDeduplication(true, 60000, 10000)
  .withLogging("debug")

  .build();

const sdk = new TeneoSDK(config);
```

### Environment Variables

Create `.env`:

```bash
TENEO_WS_URL=wss://developer.chatroom.teneo-protocol.ai/ws
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

| Strategy | Formula | Example (base=2s, mult=2) |
|----------|---------|---------------------------|
| **Exponential** | `base * mult^attempt` | 2s, 4s, 8s, 16s, 32s |
| **Linear** | `base * attempt` | 2s, 4s, 6s, 8s, 10s |
| **Constant** | `base` | 2s, 2s, 2s, 2s, 2s |

```typescript
const config = new SDKConfigBuilder()
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000,
    maxDelay: 120000,
    maxAttempts: 20,
    jitter: true              // Add 0-1000ms randomness
  })
  .build();
```

### 4. Message Deduplication

Prevents duplicate message processing with TTL-based cache:

```typescript
const config = new SDKConfigBuilder()
  .withMessageDeduplication(
    true,      // Enable
    300000,    // 5 minute TTL
    10000      // Cache up to 10k message IDs
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

1. **Check private key format (64 hex characters, no 0x):**
   ```typescript
   // ✅ Good
   privateKey: "dafe885a73d87dc34b7933068423b40a646adf5cef45954265e9a1b9be6bad9d"
   ```

2. **Verify key length:**
   ```bash
   echo -n "your_key" | wc -c
   # Should output: 64
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
     await new Promise(r => setTimeout(r, 200)); // 200ms delay
   }
   ```

### Issue: Webhook Failures

**Solutions:**

1. **Verify HTTPS (except localhost):**
   ```typescript
   // ✅ Good
   webhookUrl: "https://your-server.com/webhook"
   webhookUrl: "http://localhost:3000/webhook"

   // ❌ Bad
   webhookUrl: "http://your-server.com/webhook"
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
- ✅ 488 unit tests passing
- ✅ 98.6% pass rate
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
