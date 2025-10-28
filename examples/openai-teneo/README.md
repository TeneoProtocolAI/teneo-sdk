# OpenAI Codex + Teneo Consumer SDK Integration

Minimal example showing how to integrate **OpenAI Codex SDK** with **Teneo Consumer SDK** for intelligent agent routing and task orchestration.

## Overview

This example demonstrates a powerful integration pattern where:
1. **OpenAI Codex** analyzes user queries using thread-based conversations
2. **Codex selects** the most appropriate Teneo agent for the task
3. **Teneo SDK** executes the command on the selected agent
4. **Combined response** returned with agent selection reasoning

## Features

### Integration Features
- **Intelligent Agent Routing**: Codex analyzes queries and selects the best Teneo agent
- **Thread-Based Conversations**: Maintains conversation context across requests
- **Direct Codex Access**: Bypass Teneo and query Codex directly
- **Simple REST API**: Easy-to-use HTTP endpoints
- **Type-Safe**: Full TypeScript support with Zod validation

### Modern SDK Features
- ✅ **Automatic Wallet Derivation**: No need to manually provide wallet address
- ✅ **Auto-Reconnection**: Exponential backoff with configurable retry attempts
- ✅ **Response Caching**: Better performance with configurable cache settings
- ✅ **Signature Verification**: Optional SEC-2 message signature verification
- ✅ **Flexible Configuration**: 15+ environment variables with sensible defaults
- ✅ **Type Safety**: Full TypeScript support with Zod validation

## Prerequisites

1. **Node.js** 18+ installed
2. **OpenAI API Key** (get from https://platform.openai.com/api-keys)
3. **Teneo Credentials** (WebSocket URL, Private Key)
4. **Built Teneo SDK** (run `npm run build` in project root)
5. **Active Teneo agents** running in your room

## Installation

```bash
# From project root
npm install

# Build the SDK
npm run build

# Navigate to example directory
cd examples/openai-teneo

# Install Codex SDK (if not already installed)
npm install @openai/codex-sdk
```

## Configuration

Create `.env` file from the template:

```bash
cp examples/openai-teneo/.env.example examples/openai-teneo/.env
```

### Required Configuration

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key-here

# Teneo Network Connection
WS_URL=wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
WALLET_ADDRESS=0x1234567890123456789012345678901234567890  # Optional - auto-derived from private key

# Room Configuration
DEFAULT_ROOM=general  # or KOL tracker for X-Agent features
```

### Optional Configuration

```env
# Security Features
ENABLE_SIGNATURE_VERIFICATION=false  # Enable SEC-2 message signature verification
TRUSTED_ADDRESSES=0xAddress1,0xAddress2  # Comma-separated list of trusted agent addresses

# Performance Tuning
ENABLE_CACHE=true                    # Enable agent caching
CACHE_TIMEOUT=300000                 # Cache timeout (5 minutes)
MAX_CACHE_SIZE=100                   # Maximum cache entries

# Connection Settings
ENABLE_RECONNECTION=true             # Enable automatic reconnection
RECONNECT_DELAY=5000                 # Reconnection delay (5 seconds)
MAX_RECONNECT_ATTEMPTS=10            # Maximum reconnection attempts

# Logging
LOG_LEVEL=info                       # debug | info | warn | error | silent

# Server
PORT=3000                            # API server port
```

## Usage

### Start the Server

```bash
# From the example directory
npx tsx index.ts

# Or from project root
npx tsx examples/openai-teneo/index.ts
```

The server will start on http://localhost:3000 (or the port specified in `.env`).

## API Endpoints

### GET /health

Health check endpoint showing connection status.

**Response:**
```json
{
  "status": "ok",
  "teneo": {
    "connected": true,
    "authenticated": true
  },
  "codex": {
    "initialized": true,
    "apiKeyConfigured": true
  }
}
```

### POST /query

**Smart Agent Routing** - Codex analyzes query and selects best Teneo agent.

**Request:**
```json
{
  "message": "timeline @elonmusk 3"
}
```

**How it works:**
1. Fetches available Teneo agents via `teneoSDK.getAgents()`
2. Codex analyzes the query using thread-based conversation
3. Codex selects the most appropriate agent for the task
4. Query forwarded to selected agent via `teneoSDK.sendDirectCommand()`
5. Response returned with agent selection + agent response

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "timeline @elonmusk 3",
    "selectedAgent": "X Platform Agent",
    "selectedAgentId": "x-agent-001",
    "response": "Here are the latest 3 tweets from @elonmusk...",
    "codexSelection": "X Platform Agent",
    "metadata": {
      "agentName": "X Platform Agent",
      "duration": 2619
    }
  }
}
```

**Response Time:** Typically 2-3 seconds (Codex selection + Teneo execution)

### POST /codex

**Direct Codex Query** - Bypass Teneo and query Codex directly with thread support.

**Request:**
```json
{
  "message": "Explain quantum computing in simple terms",
  "threadId": "thread-abc123"  // Optional - for conversation continuity
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "Quantum computing is a revolutionary approach to computation that leverages quantum mechanics...",
    "threadId": "thread-abc123",
    "usage": {
      "promptTokens": 15,
      "completionTokens": 180,
      "totalTokens": 195
    }
  }
}
```

**Thread Support:** Include `threadId` to maintain conversation context across requests.

### List Teneo Agents
```bash
GET /agents
```

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "agent-001",
      "name": "weather-agent",
      "description": "Provides weather information",
      "capabilities": ["weather", "forecast"]
    }
  ]
}
```

## Usage Examples

### Using curl

```bash
# Health check
curl http://localhost:3000/health

# Smart query (Codex + Teneo) - Get X timeline
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"message": "timeline @elonmusk 5"}'

# Direct Codex query with thread support
curl -X POST http://localhost:3000/codex \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain quantum computing", "threadId": "my-conversation"}'

# List available Teneo agents
curl http://localhost:3000/agents
```

### Using JavaScript/TypeScript

```typescript
import fetch from 'node-fetch';

// Example 1: Smart agent routing (Codex selects agent)
const queryResponse = await fetch('http://localhost:3000/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'timeline @VitalikButerin 10'
  })
});

const queryData = await queryResponse.json();
console.log('Selected Agent:', queryData.data.selectedAgent);
console.log('Response:', queryData.data.response);

// Example 2: Direct Codex query with thread continuity
const threadId = 'my-thread-123';

// First message in thread
const codexResponse1 = await fetch('http://localhost:3000/codex', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'What is quantum computing?',
    threadId
  })
});

// Follow-up message in same thread
const codexResponse2 = await fetch('http://localhost:3000/codex', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'How is it different from classical computing?',
    threadId  // Same thread ID maintains context
  })
});

const data2 = await codexResponse2.json();
console.log('Codex Response:', data2.data.response);
```

## Architecture

```
┌─────────────────┐
│  HTTP Client    │
│  (curl/fetch)   │
└────────┬────────┘
         │
         │ POST /query
         ▼
┌─────────────────────────────────────┐
│     Express REST API Server         │
│  ┌────────────────────────────────┐ │
│  │ Endpoint: /query               │ │
│  └────────┬───────────────────────┘ │
│           │                          │
│  ┌────────▼────────┐  ┌───────────┐ │
│  │  Codex SDK      │  │ Teneo SDK │ │
│  │  (Thread API)   │  │ (WebSocket│ │
│  └────────┬────────┘  └─────┬─────┘ │
└───────────┼───────────────────┼──────┘
            │                   │
            ▼                   ▼
  ┌─────────────────┐  ┌─────────────────┐
  │  OpenAI Codex   │  │ Teneo Network   │
  │  (Agent Select) │  │  (X-Agent, etc) │
  └─────────────────┘  └─────────────────┘

Flow:
1. Client → POST /query {"message": "timeline @user"}
2. Server → Get available agents from Teneo SDK
3. Server → Ask Codex to select best agent
4. Codex → Returns selected agent name
5. Server → Execute command on selected agent via Teneo SDK
6. Teneo → Agent processes and responds
7. Server → Return combined response to client
```

## How It Works

### Smart Agent Routing (/query endpoint)

1. **Fetch Available Agents**
   ```typescript
   const agents = teneoSDK.getAgents();
   ```

2. **Ask Codex to Select Best Agent**
   ```typescript
   const thread = codex.startThread();
   const codexResponse = await thread.run(`
     You are an agent coordinator. Select the most appropriate agent.
     Available agents: ${agentList}
     User query: ${message}
     Respond with ONLY the agent name.
   `);
   ```

3. **Extract Agent Selection**
   ```typescript
   const selectedAgentName = codexResponse.finalResponse.trim();
   const selectedAgent = agents.find(a => a.name === selectedAgentName);
   ```

4. **Execute Command on Selected Agent**
   ```typescript
   const teneoResponse = await teneoSDK.sendDirectCommand({
     agent: selectedAgent.id,
     command: message,
     room: DEFAULT_ROOM
   }, true);  // waitForResponse = true
   ```

5. **Return Combined Response**
   - Agent selection reasoning from Codex
   - Actual response from Teneo agent
   - Metadata (duration, timestamps, etc.)

### Key Implementation Details

- **Codex Response Parsing**: Extracts `finalResponse` property from Codex SDK response object
- **Fallback Matching**: SDK uses room-based fallback when server doesn't echo `client_request_id`
- **Thread Support**: Codex maintains conversation context via thread IDs
- **Type Safety**: Full TypeScript with Zod validation throughout

## Benefits

- **Intelligent Routing**: Codex's semantic understanding selects the optimal agent
- **Thread Continuity**: Maintain conversation context across multiple requests
- **Reliable Messaging**: SDK-level fallback matching handles various server implementations
- **Flexible**: Use Codex directly (/codex) or combined with Teneo (/query)
- **Fast**: Typical response time 2-3 seconds end-to-end
- **Simple**: Minimal code (~280 lines), easy to understand and extend
- **Type-Safe**: Full TypeScript support with runtime validation

## SDK Configuration

This example uses the **modern SDKConfigBuilder pattern** for clean, type-safe Teneo SDK configuration.

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

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (get from https://platform.openai.com/api-keys) |
| `WS_URL` | Teneo WebSocket URL |
| `PRIVATE_KEY` | Ethereum private key (with 0x prefix) |

### Optional (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_MODEL` | `gpt-4-turbo-preview` | OpenAI model to use |
| `WALLET_ADDRESS` | *(auto-derived)* | Ethereum wallet (auto-derived from private key if not provided) |
| `DEFAULT_ROOM` | `general` | Default Teneo room |
| `ENABLE_SIGNATURE_VERIFICATION` | `false` | Enable SEC-2 signature verification |
| `TRUSTED_ADDRESSES` | *(empty)* | Comma-separated trusted agent addresses |
| `ENABLE_CACHE` | `true` | Enable agent caching |
| `CACHE_TIMEOUT` | `300000` | Cache timeout in ms (5 minutes) |
| `MAX_CACHE_SIZE` | `100` | Maximum cache entries |
| `ENABLE_RECONNECTION` | `true` | Enable automatic reconnection |
| `RECONNECT_DELAY` | `5000` | Reconnection delay in ms |
| `MAX_RECONNECT_ATTEMPTS` | `10` | Maximum reconnection attempts |
| `LOG_LEVEL` | `info` | Logging level: debug\|info\|warn\|error\|silent |
| `PORT` | `3000` | API server port |

See `.env.example` for complete documentation.

## Troubleshooting

### Teneo Connection Issues

**Problem:** Teneo SDK won't connect

**Solutions:**
- Verify `WS_URL` and `PRIVATE_KEY` in `.env`
- Ensure `PRIVATE_KEY` starts with `0x` prefix
- Check logs with `LOG_LEVEL=debug`
- Verify wallet has room access
- Test connection: `curl http://localhost:3000/health`

### Wallet Not Whitelisted

**Problem:** "Access restricted: Your wallet is not whitelisted"

**Solutions:**
- Contact Teneo administrator to whitelist your wallet
- Verify you're using the correct room in `DEFAULT_ROOM`
- Check your `WALLET_ADDRESS` (or let it auto-derive from `PRIVATE_KEY`)
- List available rooms and confirm agent presence

### Codex API Errors

**Problem:** Codex requests failing with 401 Unauthorized

**Solutions:**
- Verify `OPENAI_API_KEY` is correct in `.env`
- Ensure API key has sufficient credits at https://platform.openai.com/usage
- Check Codex SDK is initialized with explicit API key:
  ```typescript
  const codex = new Codex({
    apiKey: OPENAI_API_KEY || process.env.OPENAI_API_KEY
  });
  ```
- Test Codex separately via `/codex` endpoint

### Agent Selection Issues

**Problem:** Codex selects wrong agent or "[object Object]" error

**Solutions:**
- Check available agents: `curl http://localhost:3000/agents`
- Verify agents are online in your Teneo room
- Ensure proper Codex response parsing:
  ```typescript
  const selectedAgentName = (codexResponse as any).finalResponse
    || (codexResponse as any).text
    || String(codexResponse);
  ```
- Test agent directly with known agent ID

### Timeout Errors

**Problem:** Queries timeout before response arrives

**Solutions:**
- The SDK uses intelligent fallback matching for responses
- Check if agent is responding: `curl http://localhost:3000/agents`
- Increase timeout in request: `{"message": "...", "timeout": 60000}`
- Verify the agent is in the correct room (`DEFAULT_ROOM`)
- Check logs with `LOG_LEVEL=debug` to see fallback matching in action

**Note:** The SDK automatically handles servers that don't echo `client_request_id` by using room-based fallback matching within a 60-second window.

### Message Format Errors

**Problem:** Server returns "Agents should use TypeTaskResponse instead of TypeMessage" (code: 400)

**Solutions:**
- Try `DEFAULT_ROOM=general` instead of specific agent rooms
- This is a server-side protocol error, not an SDK configuration issue
- Contact your Teneo administrator about room configuration
- The SDK handles both "message" and "task_response" types automatically

## Error Handling

The API includes comprehensive error handling:

- **400 Bad Request**: Missing required parameters
- **500 Internal Server Error**: OpenAI or Teneo errors

All errors return consistent JSON format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Code Structure

```
examples/openai-teneo/
├── index.ts           # Main server (~280 lines)
├── package.json       # Dependencies
├── .env.example       # Environment template
├── .env               # Your credentials (git-ignored)
└── README.md          # This file
```

### Key Code Sections

**1. Codex SDK Initialization (lines 62-66)**
```typescript
const codex = new Codex({
  apiKey: OPENAI_API_KEY || process.env.OPENAI_API_KEY
});
```

**2. Teneo SDK Configuration (lines 40-58)**
```typescript
const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)
  .withRoom(DEFAULT_ROOM)
  .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
  .withResponseFormat({ format: 'both', includeMetadata: true })
  .withLogging(LOG_LEVEL)
  .withCache(ENABLE_CACHE, CACHE_TIMEOUT, MAX_CACHE_SIZE)
  .withSignatureVerification({
    enabled: ENABLE_SIG_VERIFICATION,
    trustedAddresses: TRUSTED_ADDRESSES,
    requireFor: ['task_response', 'agent_selected'],
    strictMode: false
  })
  .build();
```

**3. Smart Agent Routing (lines 90-196)**
- Fetch available agents from Teneo
- Ask Codex to analyze and select best agent
- Parse Codex response (extract `finalResponse`)
- Execute command via `sendDirectCommand` with `waitForResponse: true`
- Return combined response

**4. Codex Response Parsing (lines 125-143)**
```typescript
let selectedAgentName: string;
if (typeof codexResponse === 'string') {
  selectedAgentName = codexResponse.trim();
} else if (codexResponse && typeof codexResponse === 'object') {
  selectedAgentName = (codexResponse as any).finalResponse
    || (codexResponse as any).text
    || (codexResponse as any).content
    || String(codexResponse);
  // Handle nested objects
  if (typeof selectedAgentName === 'object') {
    selectedAgentName = JSON.stringify(selectedAgentName);
  }
  selectedAgentName = selectedAgentName.trim();
}
```

## Related Examples

- [Claude Agent + Teneo](../claude-agent-x-follower/) - Claude Agent SDK with custom tools
- [n8n + Teneo](../n8n-teneo/) - Visual workflow automation
- [Production Dashboard](../production-dashboard/) - Full-featured dashboard

### Comparison

| Feature | OpenAI Codex | Claude Agent | n8n |
|---------|--------------|--------------|-----|
| **Interface** | REST API | CLI Tool | Visual Workflows |
| **AI Model** | OpenAI Codex | Claude 3.5 | N/A (HTTP only) |
| **Agent Selection** | ✅ Intelligent | ✅ Custom Tool | ❌ Manual |
| **Thread Support** | ✅ Yes | ✅ Conversation | ❌ No |
| **Use Case** | API Integration | Developer Tool | Automation |
| **Complexity** | ~280 lines | ~220 lines | ~180 lines |

**Note:** All examples now use the same **modern SDKConfigBuilder pattern** with:
- ✅ Automatic wallet derivation from private key
- ✅ Auto-reconnection with exponential backoff
- ✅ Agent response caching for performance
- ✅ Optional SEC-2 signature verification
- ✅ SDK-level fallback matching for reliable message correlation
- ✅ Comprehensive environment-based configuration

## License

MIT
