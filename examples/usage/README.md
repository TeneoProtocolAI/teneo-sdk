# Teneo SDK Usage Examples

This directory contains progressive, hands-on examples demonstrating how to use the Teneo Consumer SDK. Each example builds on concepts from the previous ones, taking you from basic connection to building production-ready applications.

## 📚 Examples Overview

| # | Example | Description | Key Concepts |
|---|---------|-------------|--------------|
| 1 | [Connect](#1-basic-connection) | Basic WebSocket connection | Config builder, authentication, lifecycle |
| 2 | [List Agents](#2-list-agents) | Retrieve available agents | Agent registry, properties, statistics |
| 3 | [Pick Agent](#3-pick-specific-agent) | Direct agent communication | sendDirectCommand, response handling |
| 4 | [Find by Capability](#4-find-by-capability) | Indexed agent search | O(1) lookups, capability matching |
| 5 | [Webhooks](#5-webhook-integration) | HTTP event notifications | Webhook setup, retry logic, circuit breaker |
| 6 | [API Server](#6-simple-api-server) | REST API wrapper | Express integration, endpoint design |
| 7 | [Event Listener](#7-event-listener) | Event-driven patterns | 30+ events, real-time monitoring |

## 🚀 Prerequisites

Before running these examples, make sure you have:

1. **Node.js 18+** installed
2. **Built the SDK**: Run `npm run build` in the project root
3. **Environment variables** set up (see below)

## ⚙️ Environment Setup

Create a `.env` file in the project root or export these variables:

```bash
# Required
PRIVATE_KEY=your_ethereum_private_key_here
WS_URL=wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws

# Optional
DEFAULT_ROOM=general
WALLET_ADDRESS=0x...  # Auto-derived if not provided
LOG_LEVEL=info
```

## 📖 Usage Examples

### 1. Basic Connection

**File**: `01-connect.ts`

The simplest example - connect to Teneo and authenticate.

```bash
npx tsx examples/usage/01-connect.ts
```

**What you'll learn**:
- Using `SDKConfigBuilder` for configuration
- Connecting to the WebSocket server
- Ethereum wallet authentication
- Event listeners for connection lifecycle
- Graceful disconnection and cleanup

**Output**:
```
🚀 Example 1: Basic SDK Connection
⚙️  Step 1: Building SDK configuration...
✅ Configuration built
...
✅ Connected and authenticated!
```

---

### 2. List Agents

**File**: `02-list-agents.ts`

Retrieve and inspect all available agents in the network.

```bash
npx tsx examples/usage/02-list-agents.ts
```

**What you'll learn**:
- Getting the agent list
- Inspecting agent properties (name, description, status)
- Viewing agent capabilities and commands
- Getting statistics (online/offline counts)

**Output**:
```
📊 Agent Details:
1. X Platform Agent
   ID: x-agent-001
   Status: online
   Capabilities: social-media, twitter
   ...
```

---

### 3. Pick Specific Agent

**File**: `03-pick-agent.ts`

Find and communicate with a specific agent.

```bash
# Pick by name
npx tsx examples/usage/03-pick-agent.ts "X Platform Agent"

# Or let it auto-select
npx tsx examples/usage/03-pick-agent.ts
```

**What you'll learn**:
- Finding agents by ID or name
- Sending direct commands to agents
- Waiting for responses with timeout
- Handling both humanized and raw responses
- Response metadata (task ID, duration, etc.)

**Output**:
```
✅ Selected: X Platform Agent
⚙️  Sending command to agent...
   Command: timeline @elonmusk 3
   Waiting for response...
✅ Response received!
📝 Humanized Response: [response content]
```

---

### 4. Find by Capability

**File**: `04-find-by-capability.ts`

Use the SDK's indexed search for efficient agent discovery.

```bash
npx tsx examples/usage/04-find-by-capability.ts
```

**What you'll learn**:
- **PERF-3**: O(1) capability lookups
- O(1) status lookups (online/offline)
- O(k) name-based token search
- Performance comparison
- Practical agent selection strategies

**Output**:
```
🔍 Searching for capability: "weather-forecast"
✅ Found 2 agent(s) (0.123ms):
   • Weather Agent
   • Climate Data Agent

📊 Performance Summary:
   • Capability search: O(1) - constant time
   • Status search: O(1) - constant time
```

---

### 5. Webhook Integration

**File**: `05-webhook-example.ts`

Set up HTTP webhooks to receive SDK events.

```bash
npx tsx examples/usage/05-webhook-example.ts
```

**What you'll learn**:
- Creating a local webhook receiver
- Configuring SDK webhook delivery
- Receiving webhook events
- Automatic retry with exponential backoff
- Circuit breaker pattern
- Queue management

**Output**:
```
✅ Webhook server running on http://localhost:3001
🎯 Webhook received!
   Event: agent:response
   Timestamp: 2025-10-28T...
```

---

### 6. Simple API Server

**File**: `06-simple-api-server.ts`

Build a REST API that wraps the Teneo SDK.

```bash
npx tsx examples/usage/06-simple-api-server.ts
```

Then test with curl:

```bash
# Health check
curl http://localhost:3000/health

# List agents
curl http://localhost:3000/agents

# Send message
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","waitForResponse":true}'

# Find by capability
curl http://localhost:3000/agents/capability/weather-forecast
```

**What you'll learn**:
- Building Express REST API
- Wrapping SDK in HTTP endpoints
- Error handling patterns
- Health monitoring
- Production-ready server design

**Endpoints**:
- `GET /health` - Server and SDK health
- `GET /agents` - List all agents
- `GET /agents/:id` - Get specific agent
- `GET /agents/capability/:capability` - Find by capability
- `POST /message` - Send message to agent
- `GET /rooms` - List rooms
- `POST /rooms/:roomId/subscribe` - Subscribe to room

---

### 7. Event Listener

**File**: `07-event-listener.ts`

Listen to all SDK events for real-time monitoring.

```bash
npx tsx examples/usage/07-event-listener.ts
```

**What you'll learn**:
- All 30+ SDK event types
- Event categorization (connection, auth, agent, message, etc.)
- Real-time event monitoring
- Event-driven architecture
- Statistics and analytics

**Output**:
```
🔌 [CONNECTION] WebSocket connection opened
🔐 [AUTH] ✅ Authentication successful!
🤖 [AGENT] Agent list updated: 5 agents
📤 [MESSAGE] Message sent: Type: message
...
📊 EVENT STATISTICS
Connection events:    12
Authentication events: 4
Agent events:         8
```

---

## 🎯 Learning Path

We recommend following this learning path:

1. **Start with 01-connect.ts** to understand basic setup
2. **Try 02-list-agents.ts** to explore the agent registry
3. **Run 03-pick-agent.ts** to learn agent communication
4. **Explore 04-find-by-capability.ts** for efficient search
5. **Set up 05-webhook-example.ts** for event notifications
6. **Build 06-simple-api-server.ts** for production patterns
7. **Monitor with 07-event-listener.ts** for observability

## 🔧 Common Patterns

### Pattern 1: Basic Message Flow

```typescript
const sdk = new TeneoSDK(config);
await sdk.connect();

// Send and wait for response
const response = await sdk.sendMessage('hello', {
  room: 'general',
  waitForResponse: true,
  timeout: 30000
});

console.log(response.humanized);
```

### Pattern 2: Direct Agent Command

```typescript
// Find agent by capability
const agents = sdk.findAgentsByCapability('weather');
const weatherAgent = agents[0];

// Send direct command
const response = await sdk.sendDirectCommand({
  agent: weatherAgent.id,
  command: 'forecast for NYC',
  room: 'general'
}, true);
```

### Pattern 3: Event-Driven

```typescript
sdk.on('agent:response', (response) => {
  console.log('Response:', response.humanized);
  // Process response asynchronously
});

// Fire and forget
await sdk.sendMessage('hello', { room: 'general' });
```

## 🐛 Troubleshooting

### "PRIVATE_KEY is required"

Set the environment variable:
```bash
export PRIVATE_KEY=your_private_key_here
```

### "No agents available"

Wait a bit longer after connecting:
```typescript
await sdk.connect();
await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
```

### "Webhook delivery failed"

Ensure your webhook URL is accessible:
- Use `http://localhost:PORT` for local testing
- Use HTTPS for production webhooks
- Check firewall settings

### "Connection timeout"

Check your WebSocket URL and network:
```typescript
const config = new SDKConfigBuilder()
  .withWebSocketUrl('wss://correct-url.com/ws')
  .withReconnection({ enabled: true, maxAttempts: 10 })
  .build();
```

## 📚 Next Steps

After completing these examples, check out:

- **[Integration Examples](../INTEGRATION_EXAMPLES.md)** - Claude, OpenAI, n8n integrations
- **[Production Dashboard](../production-dashboard/)** - Full-featured monitoring UI
- **[API Documentation](../../docs/)** - Complete API reference
- **[Main README](../../README.md)** - Full SDK documentation

## 💡 Tips

1. **Always build the SDK first**: Run `npm run build` before running examples
2. **Use environment variables**: Don't hardcode credentials
3. **Enable debug logging**: Set `LOG_LEVEL=debug` for troubleshooting
4. **Check health status**: Use `sdk.getHealth()` to monitor SDK state
5. **Handle errors**: Always use try-catch blocks in production code

## 🤝 Contributing

Found an issue or want to add an example? Please open an issue or PR!

## 📄 License

MIT - See [LICENSE](../../LICENSE) for details

