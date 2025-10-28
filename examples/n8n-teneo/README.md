# Teneo Consumer SDK + n8n Integration Example

**Minimal example** demonstrating how to integrate Teneo Consumer SDK with n8n workflow automation.

Similar in scope to the `claude-agent-x-follower` example - simple, focused, and easy to understand.

---

## Overview

This example shows how to:
1. Wrap Teneo Consumer SDK in a simple Express.js REST API
2. Deploy the service with n8n using Docker Compose
3. Create n8n workflows that query Teneo agents

### Use Case

Query Teneo agents (like X-Agent for Twitter/X data) from visual n8n workflows for social media analysis and automation.

---

## Architecture

```
┌──────────────────────────┐
│      n8n Workflow        │
│  (Visual Editor)         │
│  - HTTP Request node     │
└──────────┬───────────────┘
           │
           │ POST /query
           │
┌──────────▼───────────────┐
│   Teneo Service          │
│   (Express API)          │
│  - GET  /health          │
│  - POST /query           │
│  - GET  /agents          │
│  ┌────────────────────┐  │
│  │ Teneo Consumer SDK │  │
│  └────────────────────┘  │
└──────────┬───────────────┘
           │
           │ WebSocket
           │
┌──────────▼───────────────┐
│   Teneo Network          │
│   (X-Agent, etc.)        │
└──────────────────────────┘
```

**Services:**
- **n8n** (port 5678) - Visual workflow automation UI
- **PostgreSQL** - n8n data persistence
- **Teneo Service** (port 3000) - REST API wrapper for Teneo SDK

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Teneo account with WebSocket URL and private key

### Setup

```bash
# 1. Navigate to this directory
cd examples/n8n-teneo

# 2. Configure environment
cp .env.example .env

# 3. Edit .env with your Teneo credentials
nano .env  # or your preferred editor

# Required:
#   WS_URL=wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws
#   PRIVATE_KEY=0x...
#   WALLET_ADDRESS=0x... (optional - auto-derived from private key)
#   DEFAULT_ROOM=general (or x-agent-enterprise-v2 for X features)
#
# Optional (all have sensible defaults):
#   ENABLE_SIGNATURE_VERIFICATION=false
#   TRUSTED_ADDRESSES=
#   ENABLE_CACHE=true
#   ENABLE_RECONNECTION=true
#   LOG_LEVEL=info

# 4. Start all services
docker-compose up -d

# 5. Watch logs (optional)
docker-compose logs -f teneo-service
```

### Verify Setup

```bash
# Check Teneo Service health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","teneo":{"connected":true,"authenticated":true}}

# List available agents
curl http://localhost:3000/agents
```

### Access n8n

1. Open http://localhost:5678 in your browser
2. Login with credentials (default: admin / admin)
3. Import the example workflow from `workflows/x-timeline.json`

---

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "teneo": {
    "connected": true,
    "authenticated": true
  }
}
```

### POST /query

Send a message to Teneo coordinator (auto-selects appropriate agent).

**Request:**
```json
{
  "message": "timeline @elonmusk 10",
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "humanized": "Here are the latest 10 tweets from @elonmusk...",
    "raw": { /* full agent response */ },
    "metadata": {
      "agentName": "X-Agent",
      "duration": 2500
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "No response from agent"
}
```

### GET /agents

List available Teneo agents.

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "x-agent",
      "name": "X-Agent",
      "description": "Twitter/X data retrieval",
      "capabilities": ["timeline", "search", "user"]
    }
  ]
}
```

---

## Creating n8n Workflows

### Method 1: Import Example Workflow

1. In n8n, go to **Workflows** → **Import from File**
2. Select `workflows/x-timeline.json`
3. Click **Test workflow** to execute

### Method 2: Create Manually

1. Add **Manual Trigger** node
2. Add **HTTP Request** node:
   - **Method**: POST
   - **URL**: `http://teneo-service:3000/query`
   - **Body**: JSON
   - **JSON Body**:
     ```json
     {
       "message": "timeline @elonmusk 10"
     }
     ```
3. Add **Set** node to extract response:
   - Add field: `response` = `{{ $json.data.humanized }}`
   - Add field: `agent` = `{{ $json.data.metadata.agentName }}`
4. Connect nodes and execute!

### Example Queries

**X Timeline:**
```json
{ "message": "timeline @elonmusk 10" }
```

**X User Search:**
```json
{ "message": "search user elonmusk" }
```

**X Tweet Search:**
```json
{ "message": "search tweets AI agents" }
```

---

## Development

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Create .env file with your credentials
cp .env.example .env
nano .env

# Start in watch mode
npm run dev
```

### Testing Locally

```bash
# Test health
curl http://localhost:3000/health

# Test query
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"message": "timeline @elonmusk 10"}'

# Test agents list
curl http://localhost:3000/agents
```

---

## Troubleshooting

### Teneo Service won't connect

**Problem:** Teneo Service logs show connection errors

**Solutions:**
- Verify `WS_URL` and `PRIVATE_KEY` in `.env`
- Ensure `PRIVATE_KEY` starts with `0x` prefix
- Check if Teneo endpoint is accessible
- View logs: `docker-compose logs teneo-service`
- Restart service: `docker-compose restart teneo-service`
- Set `LOG_LEVEL=debug` in `.env` for detailed diagnostics

### Wallet not whitelisted

**Problem:** Logs show "Access restricted: Your wallet is not whitelisted"

**Solutions:**
- Contact your Teneo administrator to whitelist your wallet address
- Verify you're using the correct room in `DEFAULT_ROOM`
- Check your `WALLET_ADDRESS` (or let it auto-derive from `PRIVATE_KEY`)

### Message format errors

**Problem:** Server returns "Agents should use TypeTaskResponse instead of TypeMessage" (code: 400)

**Solutions:**
- Try `DEFAULT_ROOM=general` instead of `x-agent-enterprise-v2`
- This is a server-side protocol error, not an SDK configuration issue
- Contact your Teneo administrator about room configuration

### n8n can't reach Teneo Service

**Problem:** HTTP Request node times out or gets connection refused

**Solutions:**
- Use `http://teneo-service:3000` (Docker network name), NOT `localhost`
- Verify both services are on same network: `docker-compose ps`
- Check Teneo Service is healthy: `curl http://localhost:3000/health`

### Timeout errors

**Problem:** Queries timeout before response

**Note:** The SDK now includes **intelligent fallback matching** that resolves most timeout issues automatically!

**Solutions:**
- The SDK uses room-based fallback matching when servers don't echo `client_request_id`
- Typical response time: 2-3 seconds with fallback matching
- Increase timeout if needed: `{"message": "...", "timeout": 60000}`
- Check if agent is online: `curl http://localhost:3000/agents`
- Verify agent responds: Test query directly via curl
- Enable debug logging: Set `LOG_LEVEL=debug` in `.env` to see fallback matching in action

### n8n login issues

**Problem:** Can't login to n8n UI

**Solutions:**
- Default credentials: admin / admin
- Check environment: `docker-compose config | grep N8N_`
- Reset password: Update `N8N_PASSWORD` in `.env` and restart

---

## Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f teneo-service
docker-compose logs -f n8n

# Restart a service
docker-compose restart teneo-service

# Rebuild after code changes
docker-compose up -d --build

# Stop and remove all data (including workflows!)
docker-compose down -v
```

---

## Project Structure

```
examples/n8n-teneo/
├── index.ts                    # Main Teneo Service (Express + SDK)
├── docker-compose.yml          # Docker setup (n8n + PostgreSQL + Teneo Service)
├── Dockerfile                  # Teneo Service Docker image
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── .env.example                # Environment template
├── .gitignore                  # Git ignore rules
├── README.md                   # This file
└── workflows/
    └── x-timeline.json         # Example n8n workflow
```

---

## SDK Configuration

This example uses the **modern SDKConfigBuilder pattern** for clean, type-safe configuration.

### Configuration Pattern

```typescript
import { SDKConfigBuilder, TeneoSDK } from '../../dist/index.js';

const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)  // Wallet auto-derived if not provided
  .withRoom(DEFAULT_ROOM)
  .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
  .withResponseFormat({ format: 'both', includeMetadata: true })
  .withLogging(LOG_LEVEL)
  .withCache(true, 300000, 100)
  .withSignatureVerification({
    enabled: ENABLE_SIG_VERIFICATION,
    trustedAddresses: TRUSTED_ADDRESSES,
    requireFor: ['task_response', 'agent_selected'],
    strictMode: false
  })
  .build();

const teneoSDK = new TeneoSDK(config);
```

### Key Features

- ✅ **Automatic Wallet Derivation**: Wallet address automatically derived from private key using viem
- ✅ **Auto-Reconnection**: Automatic reconnection with exponential backoff
- ✅ **Response Caching**: Agent response caching for better performance
- ✅ **Signature Verification**: Optional SEC-2 message signature verification
- ✅ **Flexible Configuration**: Environment-based with sensible defaults
- ✅ **Type Safety**: Full TypeScript support with Zod validation

### Environment Variables

All configuration is loaded from environment variables (`.env` file):

**Required:**
- `WS_URL` - Teneo WebSocket endpoint
- `PRIVATE_KEY` - Ethereum private key (with 0x prefix)

**Optional (with defaults):**
- `WALLET_ADDRESS` - Ethereum wallet (auto-derived if not provided)
- `DEFAULT_ROOM` - Room to join (default: `general`)
- `ENABLE_SIGNATURE_VERIFICATION` - Enable SEC-2 verification (default: `false`)
- `TRUSTED_ADDRESSES` - Comma-separated trusted agent addresses
- `ENABLE_CACHE` - Enable agent caching (default: `true`)
- `CACHE_TIMEOUT` - Cache timeout in ms (default: `300000`)
- `MAX_CACHE_SIZE` - Max cache entries (default: `100`)
- `ENABLE_RECONNECTION` - Enable auto-reconnect (default: `true`)
- `RECONNECT_DELAY` - Reconnect delay in ms (default: `5000`)
- `MAX_RECONNECT_ATTEMPTS` - Max reconnect attempts (default: `10`)
- `LOG_LEVEL` - Logging level: debug|info|warn|error|silent (default: `info`)
- `PORT` - API server port (default: `3000`)

See `.env.example` for complete documentation.

---

## SDK Improvements

This example benefits from recent SDK improvements:

### Intelligent Fallback Matching

The SDK now includes **two-tier message correlation** for reliable response handling:

1. **Primary Matching**: Uses `client_request_id` when server supports it
2. **Fallback Matching**: Uses room + time window (60s) when server doesn't support request IDs

```typescript
// Both coordinator and direct agent calls use waitForResponse
if (agent) {
  response = await teneoSDK.sendDirectCommand({
    agent,
    command: message,
    room: DEFAULT_ROOM
  }, true);  // waitForResponse = true - SDK handles matching automatically
} else {
  response = await teneoSDK.sendMessage(message, {
    waitForResponse: true,
    timeout
  });
}
```

**Benefits:**
- Works with all Teneo server implementations
- Typical response time: **2-3 seconds**
- No manual event listener management
- Automatic retry with exponential backoff

### Enhanced Message Handling

The SDK properly handles both "message" and "task_response" types from agents:

- X-Agent and other agents that send "message" type responses work seamlessly
- Task-based agents with "task_response" type also work
- Both types include full metadata and correlation fields

## Comparison with Other Examples

| Aspect | n8n-teneo | claude-agent-x-follower | openai-teneo |
|--------|-----------|------------------------|--------------|
| **Integration** | n8n Workflows | Claude Agent SDK | OpenAI Codex SDK |
| **Main File** | 1 file (~180 lines) | 1 file (~220 lines) | 1 file (~280 lines) |
| **Setup** | Docker Compose | npm install + run | npm install + run |
| **Interface** | Visual Web UI | CLI | REST API |
| **AI Model** | N/A (HTTP only) | Claude 3.5 | OpenAI Codex |
| **Use Case** | Visual automation | Developer tool | API integration |
| **Agent Selection** | Manual | Custom MCP Tool | Intelligent (Codex) |
| **Complexity** | Minimal | Minimal | Minimal |
| **Response Time** | 2-3 seconds | 2-3 seconds | 2-3 seconds |

All examples use the **modern SDKConfigBuilder pattern** with:
- ✅ Automatic wallet derivation from private key
- ✅ Auto-reconnection with exponential backoff
- ✅ Agent response caching for better performance
- ✅ Optional SEC-2 signature verification
- ✅ **SDK-level fallback matching for reliable message correlation**
- ✅ Comprehensive environment-based configuration with 15+ options

---

## Next Steps

### Extend the Example

1. **Add More Endpoints**
   - Add `/direct` endpoint for direct agent queries
   - Add webhook configuration endpoint
   - Add signature verification status endpoint

2. **Advanced Workflows**
   - Schedule periodic X timeline checks
   - Trigger workflows from Teneo events
   - Multi-step agent orchestration
   - Implement circuit breaker for reliability

3. **Production Deployment**
   - Add authentication (API keys)
   - Add rate limiting
   - Add monitoring and logging
   - Enable signature verification (SEC-2)
   - Configure trusted agent addresses
   - Deploy to cloud (AWS, GCP, Azure)
   - Use environment variables instead of .env file

4. **Leverage New SDK Features**
   - Use auto-reconnection for better reliability
   - Enable response caching for performance
   - Implement signature verification for security
   - Monitor cache hit rates and adjust settings
   - Set up webhook integration for real-time events

### Learn More

- **Teneo SDK Docs**: See `../../TENEO_CONSUMER_SDK.md`
- **n8n Documentation**: https://docs.n8n.io/
- **Docker Compose**: https://docs.docker.com/compose/

---

## License

MIT

---

## Support

For issues or questions:
- Teneo SDK: See main repository issues
- n8n: https://community.n8n.io/
- This example: Open an issue in the main repository

---

**Happy automating!** 🚀
