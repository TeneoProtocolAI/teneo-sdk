# Production Dashboard Example

A comprehensive, production-ready example demonstrating **ALL features** of the Teneo Protocol SDK using modern technologies: **Hono** (fast web framework) and **Bun** (fast JavaScript runtime).

## 🎯 What This Example Demonstrates

This is the **ultimate reference implementation** showcasing every SDK capability in a real-world application.

### Core Features

✅ **WebSocket Connection** - Auto-reconnection with exponential backoff
✅ **Ethereum Authentication** - Wallet-based authentication
✅ **Message Sending** - Coordinator-based and direct agent commands
✅ **Room Management** - Subscribe, unsubscribe, and list rooms
✅ **Agent Discovery** - List agents with capabilities
✅ **Response Formatting** - Raw JSON, humanized text, or both

### Advanced Features

✅ **Private Key Encryption** (SEC-3) - Encrypted private key storage in memory
✅ **Message Signature Verification** (SEC-2) - Cryptographic message validation
✅ **Indexed Agent Lookups** (PERF-3) - O(1) agent search by capability/status
✅ **Configurable Retry Strategies** (REL-3) - Custom backoff for reconnection/webhooks
✅ **Message Deduplication** (CB-4) - TTL-based duplicate message prevention
✅ **Webhook Integration** - Real-time event streaming with circuit breaker
✅ **Rate Limiting** - Configurable rate limiting with status monitoring
✅ **Health Monitoring** - Comprehensive health checks for all components
✅ **SSRF Protection** - Webhook URL validation
✅ **Error Handling** - Custom error classes with recovery strategies
✅ **Event System** - Complete event-driven architecture

### Production Features

✅ **Health Check Endpoint** - `/health` for Kubernetes/Docker monitoring
✅ **Metrics Endpoint** - `/metrics` for observability
✅ **Graceful Shutdown** - Proper cleanup on SIGINT/SIGTERM
✅ **Structured Logging** - Debug logging for troubleshooting
✅ **Environment Configuration** - 12-factor app principles
✅ **Real-time Updates** - Server-Sent Events (SSE) for live dashboard

## 🚀 Quick Start

### Prerequisites

- **Bun** (v1.0.0 or higher) - [Install Bun](https://bun.sh)
- **Teneo Account** - WebSocket URL and private key
- **Node.js** (v18+) if not using Bun

### Installation

1. **Clone the repository** (if not already):

   ```bash
   git clone https://github.com/TeneoProtocolAI/sdk.git
   cd sdk
   ```

2. **Install dependencies**:

   ```bash
   cd examples/production-dashboard
   bun install
   ```

3. **Configure environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run the dashboard**:

   ```bash
   bun run server.ts
   ```

5. **Open the dashboard**:
   ```
   http://localhost:3000
   ```

### Using npm/pnpm Instead of Bun

```bash
npm install hono @hono/node-server
npm run dev  # or: node --loader ts-node/esm server.ts
```

## 📁 Project Structure

```
production-dashboard/
├── server.ts              # Hono server with SDK integration
├── public/
│   └── dashboard.html     # Beautiful responsive dashboard UI
├── package.json           # Bun-specific configuration
├── .env.example           # Environment template
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Required
WS_URL=wss://your-teneo-server.com/ws
PRIVATE_KEY=0x...your-private-key
WALLET_ADDRESS=0x...your-wallet-address

# Optional
DEFAULT_ROOM=general
PORT=3000

# Security Features
ENABLE_SIGNATURE_VERIFICATION=true
TRUSTED_ADDRESSES=0xAgent1...,0xAgent2...

# Webhook (auto-configured to localhost)
WEBHOOK_URL=http://localhost:3000/webhook
```

### SDK Configuration

The example initializes the SDK with all features enabled:

```typescript
// SEC-3: Encrypt private key in memory
const secureKey = new SecurePrivateKey(PRIVATE_KEY);

const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(secureKey, WALLET_ADDRESS) // Use encrypted key
  .withAutoJoinRooms([DEFAULT_ROOM])
  .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
  // REL-3: Custom retry strategies for production
  .withReconnectionStrategy({
    type: "exponential",
    baseDelay: 3000,
    maxDelay: 120000,
    maxAttempts: 15,
    jitter: true,
    backoffMultiplier: 2.5
  })
  .withWebhookRetryStrategy({
    type: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 5,
    jitter: false
  })
  .withResponseFormat({ format: "both", includeMetadata: true })
  .withLogging("debug")
  .withCache(true, 300000, 100)
  .withSignatureVerification({
    enabled: ENABLE_SIG_VERIFICATION,
    trustedAddresses: TRUSTED_ADDRESSES,
    requireFor: ["task_response", "agent_selected"],
    strictMode: false
  })
  .build();
```

## 📡 API Endpoints

### Dashboard & UI

- `GET /` - Main dashboard interface

### Monitoring

- `GET /health` - Health check (connection, auth, webhooks, circuit breaker)
- `GET /metrics` - SDK metrics (agents, rooms, messages, errors)

### Webhooks

- `POST /webhook` - Webhook receiver endpoint

### Messages

- `POST /api/message` - Send message to coordinator

  ```json
  {
    "content": "What is blockchain?",
    "waitForResponse": true
  }
  ```

- `POST /api/direct-command` - Send direct agent command
  ```json
  {
    "agent": "weather-agent",
    "command": "weather New York",
    "room": "general"
  }
  ```

### Agent & Room Management

- `GET /api/agents` - List all available agents
- `GET /api/agents/search/capability/:capability` - **PERF-3**: Search by capability (O(1))
- `GET /api/agents/search/name/:name` - **PERF-3**: Search by name (O(k))
- `GET /api/agents/search/status/:status` - **PERF-3**: Search by status (O(1))
- `GET /api/rooms` - List all available rooms
- `GET /api/deduplication` - **CB-4**: Get message deduplication status
- `POST /api/room/subscribe` - Subscribe to a room
  ```json
  {
    "roomId": "tech-support"
  }
  ```
- `POST /api/room/unsubscribe` - Unsubscribe from a room

### Real-time Data

- `GET /api/events` - Get recent events (JSON)
- `GET /api/messages` - Get recent messages (JSON)
- `GET /api/webhooks` - Get received webhooks (JSON)
- `GET /api/sse` - Server-Sent Events stream

## 🎨 Dashboard Features

### Status Panel

- **Connection Status**: Real-time WebSocket connection state
- **Authentication**: Authentication status and wallet address
- **Agent Count**: Number of available agents
- **Message Count**: Total messages sent

### Message Interface

- **Send Message**: Send to coordinator (automatic agent selection)
- **Send & Wait**: Send and wait for response (synchronous)
- **Message History**: View all messages and responses

### Tabs

1. **Agents Tab**: List all agents with capabilities and status
2. **Rooms Tab**: Manage room subscriptions (subscribe/unsubscribe)
3. **Messages Tab**: View message history with responses
4. **Webhooks Tab**: Monitor received webhooks
5. **Events Tab**: Real-time event stream

### Health Monitor

- Overall system health status
- Webhook circuit breaker state
- Rate limiter status
- System uptime

## 🔍 Feature Deep Dive

### Private Key Encryption (SEC-3)

The dashboard protects your private key in memory using encryption:

```typescript
import { SecurePrivateKey } from "@teneo-protocol/sdk";

// Encrypt private key in memory
const secureKey = new SecurePrivateKey(process.env.PRIVATE_KEY);

// Use with SDK - automatically decrypted when needed
const config = new SDKConfigBuilder()
  .withAuthentication(secureKey, WALLET_ADDRESS)
  .build();
```

**Security Benefits:**
- Private key is encrypted in memory using AES-256-GCM
- Protected from memory dumps and debugging tools
- Automatic secure cleanup when no longer needed
- Minimal performance overhead

**Example Test:**
```bash
# Without encryption: private key visible in memory dump
# With encryption: only encrypted bytes visible
curl http://localhost:3000/metrics
# Your private key is never exposed in logs or responses
```

### Message Deduplication (CB-4)

Prevent duplicate message processing using a TTL-based cache:

```typescript
// CB-4: Message deduplication to prevent duplicate processing
.withMessageDeduplication(
  true,     // Enabled by default
  120000,   // 2 minute TTL (increased from default 60s for production)
  50000     // 50k message cache (increased from default 10k for high volume)
)
```

**How It Works:**
- Maintains an in-memory cache of processed message IDs
- Automatically expires entries after TTL (Time To Live)
- Bounded size prevents unbounded memory growth
- Messages without IDs are allowed through (graceful degradation)

**Configuration Options:**
- `enabled`: Enable/disable deduplication (default: true)
- `ttl`: How long to remember message IDs in milliseconds (default: 60000ms = 1 minute)
- `maxSize`: Maximum number of message IDs to cache (default: 10000)

**Monitoring:**
```bash
# Check deduplication status
curl http://localhost:3000/api/deduplication

# Response:
{
  "enabled": true,
  "cacheSize": 1234,      // Current number of cached IDs
  "ttl": 120000,          // TTL in milliseconds
  "maxSize": 50000,       // Maximum cache size
  "utilization": "2.47%"  // Cache utilization percentage
}
```

**Events:**
- `message:duplicate` - Emitted when a duplicate message is detected and skipped

**Testing:**
1. Send the same message multiple times rapidly
2. Watch Events tab for `message:duplicate` events
3. Verify duplicates are not processed
4. Monitor `/api/deduplication` to see cache size increase

**Production Benefits:**
- Prevents duplicate task execution if messages are retransmitted
- Protects against network-level duplicates during reconnections
- Configurable TTL balances memory usage vs duplicate window
- Zero-cost when messages lack IDs (backwards compatible)

### Indexed Agent Lookups (PERF-3)

Fast agent searches using O(1) or O(k) indexed lookups instead of O(n) filtering:

```bash
# Find agents with specific capability (O(1) lookup)
curl http://localhost:3000/api/agents/search/capability/weather-forecast

# Find agents by name (O(k) token-based search)
curl http://localhost:3000/api/agents/search/name/weather

# Find all online agents (O(1) lookup)
curl http://localhost:3000/api/agents/search/status/online
```

**Performance Comparison:**
- Traditional: O(n) - iterate through all agents
- Indexed: O(1) - direct map lookup for capability/status
- Indexed: O(k) - token-based search for names (k = tokens)

**SDK Usage:**
```typescript
// Fast capability search
const weatherAgents = sdk.findAgentsByCapability("weather-forecast");

// Fast partial name search
const agentsWithWeather = sdk.findAgentsByName("weather");

// Fast status filtering
const onlineAgents = sdk.findAgentsByStatus("online");
```

### Configurable Retry Strategies (REL-3)

Customize retry behavior for both WebSocket reconnection and webhook delivery:

```typescript
// Aggressive reconnection for production uptime
.withReconnectionStrategy({
  type: "exponential",      // exponential | linear | constant
  baseDelay: 3000,          // First retry after 3s
  maxDelay: 120000,         // Cap at 2 minutes
  maxAttempts: 15,          // Try up to 15 times
  jitter: true,             // Prevent thundering herd
  backoffMultiplier: 2.5    // Faster escalation
})

// Predictable webhook retries
.withWebhookRetryStrategy({
  type: "exponential",
  baseDelay: 1000,
  maxDelay: 30000,
  maxAttempts: 5,
  jitter: false             // Predictable for debugging
})
```

**Strategy Types:**

1. **Exponential** (recommended for production):
   - Delay: `baseDelay * multiplier^(attempt-1)`
   - Example: 1s, 2s, 4s, 8s, 16s...
   - Best for: Network failures, server overload

2. **Linear** (predictable delays):
   - Delay: `baseDelay * attempt`
   - Example: 2s, 4s, 6s, 8s, 10s...
   - Best for: Rate-limited APIs

3. **Constant** (testing/debugging):
   - Delay: `baseDelay`
   - Example: 5s, 5s, 5s, 5s, 5s...
   - Best for: Testing, fixed intervals

**Jitter** adds 0-1000ms random delay to prevent synchronized retries.

### Message Signature Verification (SEC-2)

When enabled, the SDK verifies Ethereum signatures on incoming messages:

```typescript
.withSignatureVerification({
  enabled: true,
  trustedAddresses: ['0x123...', '0x456...'], // Whitelist
  requireFor: ['task_response', 'agent_selected'], // Required message types
  strictMode: false // Warn vs reject unsigned messages
})
```

**Events emitted:**

- `signature:verified` - Signature validated successfully
- `signature:failed` - Signature validation failed
- `signature:missing` - Signature missing but optional

### Webhook Integration with Circuit Breaker

Webhooks are sent to your endpoint with automatic retry and circuit breaker:

```typescript
sdk.configureWebhook("https://your-server.com/webhook", {
  Authorization: "Bearer token",
  "X-API-Key": "secret"
});
```

**Circuit Breaker States:**

- `CLOSED` - Normal operation
- `OPEN` - Too many failures, webhooks paused
- `HALF_OPEN` - Testing if service recovered

**Webhook Events:**

- `webhook:sent` - Webhook sent to endpoint
- `webhook:success` - Endpoint acknowledged
- `webhook:error` - Delivery failed
- `webhook:retry` - Retry attempt

### Health Monitoring

The `/health` endpoint returns comprehensive status:

```json
{
  "status": "healthy",
  "timestamp": "2024-10-14T00:00:00.000Z",
  "connection": {
    "status": "connected",
    "authenticated": true,
    "reconnectAttempts": 0
  },
  "webhook": {
    "configured": true,
    "status": "healthy",
    "pending": 0,
    "failed": 0,
    "circuitState": "CLOSED"
  },
  "agents": {
    "count": 5
  },
  "rooms": {
    "count": 3,
    "subscribedRooms": ["general", "announcements"]
  }
}
```

### Rate Limiting

The SDK includes built-in rate limiting to prevent overwhelming the server:

```typescript
.withCache(true, 300000, 100)
```

Monitor rate limit status via `/metrics` endpoint.

## 🧪 Testing the Features

### 1. Test Connection & Authentication

- Open dashboard
- Watch connection status turn green
- See authentication complete with wallet address

### 2. Test Message Sending

- Type a message in the input box
- Click "Send Message" (fire and forget)
- Click "Send & Wait" (wait for response)
- View response in Messages tab

### 3. Test Agent Selection

- Send: "What is blockchain?"
- Watch Events tab for `agent:selected` event
- See coordinator's reasoning for agent selection

### 4. Test Webhooks

- Send a message
- Watch Webhooks tab for incoming webhook events
- See event types: `task`, `agent_selected`, `task_response`

### 5. Test Room Management

- Go to Rooms tab
- Enter a room ID
- Click "Subscribe to Room"
- See room appear in subscribed list
- Click "Unsubscribe" to unsubscribe from room

### 6. Test Signature Verification

- Enable in `.env`: `ENABLE_SIGNATURE_VERIFICATION=true`
- Add trusted addresses
- Watch Events tab for `signature:verified` events
- See failed verifications for untrusted addresses

### 7. Test Health Monitoring

- Open: `http://localhost:3000/health`
- See comprehensive health status
- Monitor circuit breaker state
- Check metrics: `http://localhost:3000/metrics`

### 8. Test Message Deduplication (CB-4)

- Send a message and note the response
- Simulate network issues by sending the same message multiple times
- Watch Events tab for `message:duplicate` events
- Verify only the first message is processed
- Check deduplication status:
  ```bash
  curl http://localhost:3000/api/deduplication
  ```
- See cache size increase with each unique message
- Wait for TTL to expire and verify cache cleanup

### 9. Test Indexed Agent Lookups (PERF-3)

- Search by capability:
  ```bash
  curl http://localhost:3000/api/agents/search/capability/weather
  ```
- Search by name:
  ```bash
  curl http://localhost:3000/api/agents/search/name/weather
  ```
- Search by status:
  ```bash
  curl http://localhost:3000/api/agents/search/status/online
  ```
- Compare response times with large agent lists

### 10. Test Retry Strategies (REL-3)

- Disconnect from network
- Watch Events tab for reconnection attempts
- Observe exponential backoff with jitter: 3s, ~7.5s, ~18.75s...
- See max 15 attempts before giving up
- Reconnect network and see instant recovery

### 11. Verify Private Key Encryption (SEC-3)

- Check server logs for "Private key encrypted in memory" message
- Confirm no private key appears in any logs or API responses
- Private key is only decrypted when signing messages

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard UI (Browser)                    │
│  ┌────────┬─────────┬──────────┬───────────┬────────────┐  │
│  │ Status │ Agents  │  Rooms   │ Messages  │  Webhooks  │  │
│  └────────┴─────────┴──────────┴───────────┴────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP + SSE
┌─────────────────────▼───────────────────────────────────────┐
│                    Hono Server (Bun)                         │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  API Routes  │  │  SSE Stream │  │ Webhook Receiver │  │
│  └──────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Teneo SDK                                 │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │WebSocket │  Auth    │ Messages │  Rooms   │ Webhooks │  │
│  │ Client   │  Manager │  Router  │ Manager  │ Handler  │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Signature Verifier │ Rate Limiter │ Circuit Breaker │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                 Teneo AI Network                             │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │ Agent 1  │ Agent 2  │ Agent 3  │ Agent N  │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
└──────────────────────────────────────────────────────────────┘
```

## 🐛 Troubleshooting

### Connection Issues

- **Problem**: Dashboard shows "Disconnected"
- **Solution**: Check `.env` file has correct `WS_URL` and credentials
- **Check**: Look at server console for error messages

### Authentication Failures

- **Problem**: "Authentication Pending" never completes
- **Solution**: Verify `PRIVATE_KEY` and `WALLET_ADDRESS` are correct
- **Check**: Ensure wallet has access to the Teneo network

### Webhook Not Receiving

- **Problem**: Webhooks tab is empty
- **Solution**: Webhooks are configured to `localhost` by default
- **Note**: For production, use a publicly accessible URL

### Signature Verification Errors

- **Problem**: All messages fail verification
- **Solution**: Check `TRUSTED_ADDRESSES` includes agent addresses
- **Tip**: Set `strictMode: false` to allow unsigned messages

### Port Already in Use

- **Problem**: `EADDRINUSE: address already in use`
- **Solution**: Change `PORT` in `.env` or kill existing process
- **Command**: `lsof -ti:3000 | xargs kill -9` (Mac/Linux)

## 📚 Learn More

### Related Documentation

- [Teneo SDK Documentation](../../README.md)
- [Hono Framework](https://hono.dev)
- [Bun Runtime](https://bun.sh)

### Other Examples

- [Basic Usage](../basic-usage.ts) - Simple CLI example
- [Webhook Integration](../webhook-integration.ts) - Webhook focus
- [Battle App](../x-influencer-battle-server.ts) - Specific use case

## 🚢 Deployment

### Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "server.ts"]
```

### Kubernetes

```yaml
apiVersion: v1
kind: Service
metadata:
  name: teneo-dashboard
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 3000
  selector:
    app: teneo-dashboard

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: teneo-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: teneo-dashboard
  template:
    metadata:
      labels:
        app: teneo-dashboard
    spec:
      containers:
        - name: dashboard
          image: your-registry/teneo-dashboard:latest
          ports:
            - containerPort: 3000
          env:
            - name: WS_URL
              valueFrom:
                secretKeyRef:
                  name: teneo-secrets
                  key: ws-url
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
```

## 📝 License

MIT - See [LICENSE](../../LICENSE) for details

## 🤝 Contributing

This example is part of the Teneo Protocol SDK. For contributions, please see the main [CONTRIBUTING.md](../../CONTRIBUTING.md).

## 💡 Tips

- **Development**: Use `bun --watch server.ts` for auto-reload
- **Production**: Set `logLevel: 'info'` and enable all security features
- **Monitoring**: Integrate `/health` endpoint with your monitoring stack
- **Scaling**: Dashboard is stateless and can be horizontally scaled
- **Security**: Always use HTTPS webhooks in production

---

**🎉 Enjoy exploring the Teneo SDK!**

For questions or issues, visit our [GitHub repository](https://github.com/TeneoProtocolAI/sdk).
