# Teneo Protocol SDK

Connect your app to AI agents on the Teneo network. This TypeScript SDK handles WebSocket connections, authentication, room management, and real-time events so you can focus on building your application.

## What You Can Build

- **Chat Applications** - Connect users to AI agents through WebSocket in real-time
- **Backend Integrations** - Add Teneo agents to your Node.js/TypeScript backend
- **Monitoring Dashboards** - Track agent activity, messages, and health metrics
- **Multi-Agent Systems** - Coordinate multiple agents across different rooms
- **Event-Driven Apps** - React to agent responses, selections, and state changes

The SDK provides production-ready networking, Ethereum wallet authentication, automatic reconnection, circuit breakers, rate limiting, and comprehensive error handling.

## Requirements

- **Node.js 18.0 or later** (we tested on v20.17.0)
- **npm, yarn, or pnpm** for package management
- **Ethereum private key** for network authentication
- **Access to Teneo network** (WebSocket endpoint URL)

## Installation

```bash
npm install @teneo-protocol/sdk

# or
yarn add @teneo-protocol/sdk

# or
pnpm add @teneo-protocol/sdk
```

## Quick Start

### Your First Connection

Here's the simplest way to connect and send a message:

```typescript
import { TeneoSDK, SDKConfigBuilder } from "@teneo-protocol/sdk";

const sdk = new TeneoSDK({
  wsUrl: "wss://your-teneo-server.com/ws",
  privateKey: "your_private_key_here", // Without 0x prefix
  defaultRoom: "general"
});

// Listen for successful connection
sdk.on("auth:success", async () => {
  console.log("Connected! Sending message...");

  const response = await sdk.sendMessage("Hello, agents!", {
    waitForResponse: true,
    timeout: 30000
  });

  console.log("Response:", response?.humanized);
  sdk.disconnect();
});

// Connect to the network
await sdk.connect();
```

That's it! You just connected to Teneo and talked to an AI agent.

## Using the Config Builder

For more control, use the fluent configuration builder:

```typescript
import { SDKConfigBuilder } from "@teneo-protocol/sdk";

const config = new SDKConfigBuilder()
  .withWebSocketUrl("wss://your-server.com/ws")
  .withAuthentication(
    "your_private_key",
    "0xYourWalletAddress" // Optional - auto-derived if not provided
  )
  .withRoom("general")
  .withReconnection({
    enabled: true,
    delay: 5000,
    maxAttempts: 10
  })
  .withResponseFormat({
    format: "both", // Get both raw and humanized responses
    includeMetadata: true
  })
  .withLogging("info")
  .build();

const sdk = new TeneoSDK(config);
```

## Real-World Example: Chat Bot

```typescript
import { TeneoSDK } from "@teneo-protocol/sdk";

const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  defaultRoom: "support",
  reconnect: true,
  responseFormat: "humanized"
});

// Listen for agent responses
sdk.on("agent:response", (response) => {
  console.log(`${response.agentName}: ${response.humanized}`);

  // Send to your users via your chat system
  chatSystem.broadcast({
    from: response.agentName,
    message: response.humanized,
    timestamp: new Date()
  });
});

// Listen for errors
sdk.on("error", (error) => {
  console.error("SDK Error:", error.message);
});

// Connect once at startup
await sdk.connect();

// Your chat handler
app.post("/chat", async (req, res) => {
  const { message, userId } = req.body;

  // Send to Teneo - response comes via event listener
  await sdk.sendMessage(message, {
    from: userId,
    room: "support"
  });

  res.json({ status: "sent" });
});
```

## Event Handling

The SDK emits events for everything that happens:

```typescript
// Connection events
sdk.on("connection:open", () => {
  console.log("WebSocket connected");
});

sdk.on("connection:close", (code, reason) => {
  console.log(`Disconnected: ${reason}`);
});

sdk.on("connection:reconnecting", (attempt) => {
  console.log(`Reconnecting... (attempt ${attempt})`);
});

// Authentication events
sdk.on("auth:success", (state) => {
  console.log(`Authenticated as: ${state.walletAddress}`);
  console.log(`Whitelisted: ${state.isWhitelisted}`);
});

// Agent events
sdk.on("agent:selected", (data) => {
  console.log(`Agent selected: ${data.agentName}`);
  console.log(`Reasoning: ${data.reasoning}`);
});

sdk.on("agent:response", (response) => {
  console.log("Got response:", response.content);
});

sdk.on("agent:list", (agents) => {
  console.log(`${agents.length} agents available`);
});
```

See all available events in the [Events Guide](docs/guides/events.md).

## Room Management

Work with multiple rooms for different contexts:

```typescript
// Join a room
await sdk.joinRoom("tech-support");

// Switch to that room for messages
sdk.setCurrentRoom("tech-support");

// Send to a specific room
await sdk.sendMessage("Need help!", { room: "tech-support" });

// Get all rooms
const rooms = sdk.getRooms();
console.log("Available rooms:", rooms.map(r => r.id));

// Leave a room
await sdk.leaveRoom("tech-support");
```

## Finding Agents

The SDK includes fast indexed lookups for finding agents:

```typescript
// Get all agents
const allAgents = sdk.getAgents();

// Find by capability (O(1) lookup)
const weatherAgents = sdk.findAgentsByCapability("weather");

// Find by name (token-based search, supports partial matches)
const searchResults = sdk.findAgentsByName("weather");
// Matches: "Weather Agent", "Weather Bot", "Advanced Weather", etc.

// Find by status (O(1) lookup)
const onlineAgents = sdk.findAgentsByStatus("online");
```

## Webhook Integration

Get real-time notifications via HTTP webhooks:

```typescript
// Configure webhook endpoint
sdk.configureWebhook("https://your-server.com/webhook", {
  "Authorization": "Bearer your-token",
  "X-Custom-Header": "value"
});

// Monitor webhook events
sdk.on("webhook:sent", (payload, url) => {
  console.log("Webhook sent to", url);
});

sdk.on("webhook:success", (response, url) => {
  console.log("Webhook delivered");
});

sdk.on("webhook:error", (error, url) => {
  console.error("Webhook failed:", error.message);
});

// Check webhook status
const status = sdk.getWebhookStatus();
console.log("Queue size:", status.queueSize);
console.log("Circuit state:", status.circuitState);
```

Your webhook endpoint receives POST requests:

```json
{
  "event": "task_response",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "taskId": "task_123",
    "agentName": "Weather Agent",
    "content": "The weather in NYC is sunny, 72°F",
    "success": true
  }
}
```

## Advanced Features

### Secure Private Keys (SEC-3)

Encrypt private keys in memory to protect against memory dumps:

```typescript
import { SecurePrivateKey } from "@teneo-protocol/sdk";

const secureKey = new SecurePrivateKey(process.env.PRIVATE_KEY!);

const config = new SDKConfigBuilder()
  .withAuthentication(secureKey) // Pass SecurePrivateKey instead of string
  .build();
```

### Custom Retry Strategies (REL-3)

Configure exponential backoff for reconnection and webhooks:

```typescript
const config = new SDKConfigBuilder()
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000,
    maxDelay: 120000,
    maxAttempts: 15,
    jitter: true, // Prevents thundering herd
    backoffMultiplier: 2.5
  })
  .withWebhookRetryStrategy({
    type: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 5,
    jitter: false
  })
  .build();
```

### Message Deduplication (CB-4)

Prevent duplicate message processing with built-in caching:

```typescript
const config = new SDKConfigBuilder()
  .withMessageDeduplication(
    true,      // Enable deduplication
    300000,    // 5 minute TTL
    10000      // Cache up to 10,000 messages
  )
  .build();
```

### Signature Verification

Verify message authenticity with Ed25519 signatures:

```typescript
const config = new SDKConfigBuilder()
  .withSignatureVerification({
    enabled: true,
    trustedAddresses: ["0xTrustedSigner1", "0xTrustedSigner2"],
    requireFor: ["task_response", "agent_selected"],
    strictMode: false
  })
  .build();
```

## Health Monitoring

Check SDK health and connection status:

```typescript
const health = sdk.getHealth();

console.log("Status:", health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log("Connected:", health.connection.state);
console.log("Authenticated:", health.connection.authenticated);
console.log("Webhook queue:", health.webhook?.queueSize);
console.log("Circuit breaker:", health.webhook?.circuitState);
```

## Configuration Reference

### All Available Options

```typescript
const config = new SDKConfigBuilder()
  // Required
  .withWebSocketUrl("wss://server.com/ws")
  .withAuthentication("private_key", "0xWalletAddress")

  // Rooms
  .withRoom("default-room", ["room1", "room2"]) // default + auto-join

  // Reconnection
  .withReconnection({
    enabled: true,
    delay: 5000,        // Initial delay (ms)
    maxAttempts: 10     // 0 = infinite
  })

  // Webhooks
  .withWebhook("https://your-server.com/webhook", {
    "Authorization": "Bearer token"
  })

  // Response format
  .withResponseFormat({
    format: "both",           // 'raw' | 'humanized' | 'both'
    includeMetadata: true
  })

  // Logging
  .withLogging("info")        // 'debug' | 'info' | 'warn' | 'error' | 'silent'

  // Caching
  .withCache(
    true,      // Enable cache
    300000,    // TTL (ms)
    1000       // Max size
  )

  .build();
```

### Environment Variables

Create a `.env` file:

```bash
# Required
TENEO_WS_URL=wss://your-server.com/ws
PRIVATE_KEY=your_private_key_without_0x

# Optional
WALLET_ADDRESS=0xYourWalletAddress
DEFAULT_ROOM=general
```

Then use them:

```typescript
import * as dotenv from "dotenv";
dotenv.config();

const sdk = new TeneoSDK({
  wsUrl: process.env.TENEO_WS_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  walletAddress: process.env.WALLET_ADDRESS,
  defaultRoom: process.env.DEFAULT_ROOM
});
```

## Running the Examples

The SDK includes working examples in the `examples/` directory.

### Before Running Examples

1. **Build the SDK first:**

```bash
npm install
npm run build
```

2. **Set up credentials** (examples use hardcoded demo credentials by default, but you can override):

```bash
export PRIVATE_KEY=your_private_key
export WS_URL=wss://your-server.com/ws
export DEFAULT_ROOM=your_room_id
```

### Example 1: Basic Usage

Shows connection, authentication, and sending messages.

```bash
# The example has demo credentials, just run:
node -e "
const { TeneoSDK } = require('./dist');

const sdk = new TeneoSDK({
  wsUrl: 'wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws',
  privateKey: 'dafe885a73d87dc34b7933068423b40a646adf5cef45954265e9a1b9be6bad9d',
  defaultRoom: 'as1LfBarJNzOIpOQJQ7PH',
  responseFormat: 'humanized',
  logLevel: 'info'
});

sdk.on('auth:success', async () => {
  console.log('Connected!');
  const response = await sdk.sendMessage('Hello!', { waitForResponse: true });
  console.log('Response:', response?.humanized);
  setTimeout(() => sdk.disconnect(), 2000);
});

sdk.connect();
"
```

### Example 2: Production Dashboard

Full-featured monitoring dashboard with all SDK features.

```bash
# Install dashboard dependencies
cd examples/production-dashboard
npm install

# Create .env file
cat > .env << EOF
PRIVATE_KEY=your_private_key
WS_URL=wss://your-server.com/ws
DEFAULT_ROOM=your_room
EOF

# Run with Bun (faster) or Node
bun run server.ts
# or: npm start

# Open http://localhost:3000
```

### Example 3: Webhook Integration

Shows how to receive events via HTTP webhooks.

```bash
# This example requires Express
npm install express

# Then use the compiled SDK
node examples/webhook-integration.js
```

## Troubleshooting

### "ERR_REQUIRE_ESM" Error

**Problem:**
```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../node-fetch/src/index.js not supported
```

**Solution:** The SDK uses `node-fetch` v3 (ESM-only) but compiles to CommonJS. Use the compiled `dist/` version instead of running TypeScript directly:

```bash
# ✅ This works
npm run build
node your-app.js  # Using require('./dist')

# ❌ This doesn't work
npx ts-node your-app.ts
```

**Alternative:** Downgrade node-fetch (we'll fix this in the next release):

```bash
npm install node-fetch@2.7.0
npm run build
```

### "Private key must be a non-empty string"

**Problem:** The SDK can't find your private key.

**Solution:**

1. Check your `.env` file exists and has `PRIVATE_KEY=...`
2. Make sure you're loading it: `require('dotenv').config()`
3. Remove `0x` prefix if present
4. Verify the key is a 64-character hex string

```typescript
// ✅ Good
privateKey: "dafe885a73d87dc34b7933068423b40a646adf5cef45954265e9a1b9be6bad9d"

// ❌ Bad
privateKey: "0xdafe885a..." // Remove 0x
privateKey: "" // Can't be empty
privateKey: undefined // Must be a string
```

### "Authentication failed"

**Problem:** Can't connect to Teneo network.

**Solutions:**

1. **Check private key format** - should be 64 hex characters, no `0x` prefix
2. **Verify wallet is authorized** - contact Teneo team if needed
3. **Check WebSocket URL** - make sure it's correct and accessible
4. **Enable debug logging** to see details:

```typescript
const sdk = new TeneoSDK({
  // ...
  logLevel: "debug" // See detailed connection logs
});
```

### Connection Timeouts

**Problem:** SDK can't connect to WebSocket server.

**Solutions:**

1. **Check the URL is correct** - should start with `wss://` (or `ws://` for local dev)
2. **Test network access:**
   ```bash
   curl -I https://your-server.com
   ```
3. **Check firewall settings** - WebSocket ports might be blocked
4. **Increase timeout:**
   ```typescript
   const config = new SDKConfigBuilder()
     .withReconnection({
       enabled: true,
       delay: 10000, // Longer delay
       maxAttempts: 20
     })
     .build();
   ```

### Rate Limiting

**Problem:**
```
RateLimitError: Rate limit exceeded
```

**Solution:** The SDK limits to 10 requests/second by default. Either:

1. **Slow down your requests:**
   ```typescript
   await sleep(200); // Wait between messages
   ```

2. **Batch your operations** instead of rapid individual calls

3. **Check for infinite loops** in your code

### Examples Won't Run

**Problem:** Can't run the example files.

**Solution:**

1. **Build first:**
   ```bash
   npm run build
   ```

2. **For production-dashboard:**
   ```bash
   cd examples/production-dashboard
   npm install  # It has its own dependencies
   ```

3. **Use compiled version:**
   ```bash
   node -r ./dist/index.js examples/your-example.js
   ```

### TypeScript Compilation Errors

**Problem:** `npm run build` fails.

**Solutions:**

1. **Check Node version:**
   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **Clean and rebuild:**
   ```bash
   npm run clean
   npm install
   npm run build
   ```

3. **Check for conflicting dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Webhook Delivery Failures

**Problem:** Webhooks aren't being delivered.

**Solutions:**

1. **Check URL is HTTPS** (HTTP only allowed for localhost):
   ```typescript
   // ✅ Good
   webhookUrl: "https://your-server.com/webhook"
   webhookUrl: "http://localhost:3000/webhook"

   // ❌ Bad
   webhookUrl: "http://your-server.com/webhook"
   ```

2. **Verify endpoint is accessible:**
   ```bash
   curl -X POST https://your-server.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. **Check circuit breaker state:**
   ```typescript
   const status = sdk.getWebhookStatus();
   console.log("Circuit state:", status.circuitState);
   // If OPEN, fix your endpoint and wait 60s for auto-recovery
   ```

4. **Monitor webhook events:**
   ```typescript
   sdk.on("webhook:error", (error, url) => {
     console.error("Webhook error:", error.message);
   });
   ```

## Documentation

- **[API Reference](docs/api-reference/)** - Complete API documentation
- **[Guides](docs/guides/)** - Step-by-step tutorials
- **[Examples](examples/)** - Working code examples
- **[Architecture](docs/architecture/)** - How the SDK works internally

## Testing

Run the test suite:

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Teneo-SDK is open source under the [AGPL-3.0 license](LICENCE).

## Support

- **Documentation**: [docs.teneo.pro](https://docs.teneo.pro)
- **Issues**: [GitHub Issues](https://github.com/teneo-protocol/sdk/issues)
- **Discord**: [Join our community](https://discord.gg/teneo)
- **Email**: support@teneo.pro

---

Built with ❤️ by the Teneo team
Start building your Teneo integration today.
