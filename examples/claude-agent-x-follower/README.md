# Claude Agent + Teneo SDK - X Timeline Follower

A minimal example demonstrating integration between **Claude Agent SDK** and **Teneo Consumer SDK** to fetch and analyze X/Twitter timelines.

## Overview

This example shows how to:
1. ✅ Create a Claude Agent with a custom tool
2. ✅ Use the tool to call Teneo SDK and query X-Agent
3. ✅ Fetch X/Twitter timeline data
4. ✅ Let Claude analyze and summarize the results

## Architecture

```
┌─────────────────┐
│  Claude Agent   │
│  (AI Analysis)  │
└────────┬────────┘
         │ uses tool
         ▼
┌─────────────────┐
│ get_x_timeline  │
│     (Tool)      │
└────────┬────────┘
         │ calls
         ▼
┌─────────────────┐
│   Teneo SDK     │
│ (X-Agent Comm)  │
└────────┬────────┘
         │ queries
         ▼
┌─────────────────┐
│    X-Agent      │
│ (Twitter Data)  │
└─────────────────┘
```

## Prerequisites

1. **Node.js** 18+ installed
2. **Claude Code CLI** authenticated (OR Anthropic API Key)
3. **Teneo Credentials** (WebSocket URL, Private Key)
4. **Built Teneo SDK** (run `npm run build` in project root)
5. **Active X-Agent** running in the Teneo room

## Installation

```bash
# From project root
npm install

# Build the SDK
npm run build

# Install Claude Agent SDK
npm install @anthropic-ai/claude-agent-sdk
```

## Configuration

Create `.env` file from the template:

```bash
cp examples/claude-agent-x-follower/.env.example examples/claude-agent-x-follower/.env
```

### Required Configuration

```env
# Teneo Network Connection
WS_URL=wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
WALLET_ADDRESS=0x1234567890123456789012345678901234567890  # Optional - auto-derived from private key

# Room Configuration
DEFAULT_ROOM=general  # or x-agent-enterprise-v2 for X-Agent features

# Claude Configuration (Optional - only needed if Claude Code CLI is not authenticated)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
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
```

**Authentication Options:**
- **Option 1 (Recommended)**: Use Claude Code CLI authentication (if you're using Claude Code)
  - No API key needed - the example uses your local `~/.claude/.credentials.json`
  - Already configured via `pathToClaudeCodeExecutable` in the code

- **Option 2**: Use Anthropic API Key
  - Get an API key at https://console.anthropic.com/
  - Add it to `.env` as `ANTHROPIC_API_KEY`
  - Remove the `pathToClaudeCodeExecutable` line from the code

**Wallet Address Note:**
- If `WALLET_ADDRESS` is not provided, it will be automatically derived from your `PRIVATE_KEY` using viem's `privateKeyToAccount`

## Usage

### Basic Usage

```bash
# Run with default prompt (fetches @elonmusk timeline)
npx tsx examples/claude-agent-x-follower/index.ts
```

### Custom Prompts

```bash
# Analyze specific user
npx tsx examples/claude-agent-x-follower/index.ts "Get timeline for VitalikButerin and analyze sentiment"

# Compare multiple users
npx tsx examples/claude-agent-x-follower/index.ts "Compare the latest tweets from elonmusk and VitalikButerin"

# Summarize engagement
npx tsx examples/claude-agent-x-follower/index.ts "Get timeline for OpenAI and summarize the most engaging tweets"
```

## Example Output

```
🤖 Claude Agent + Teneo SDK - X Timeline Follower

📡 Connecting to Teneo network...
✅ Connected to Teneo

💬 Prompt: "Get timeline for elonmusk and summarize the latest 5 tweets"

🧠 Claude is processing...

🔧 Tool called: get_x_timeline
📥 Input: { username: 'elonmusk', count: 20 }

🔍 Fetching timeline for @elonmusk (20 tweets)...

✅ Tool result: Success

============================================================
📝 CLAUDE RESPONSE:
============================================================
I've retrieved the timeline for @elonmusk. Here's a summary of the latest 5 tweets:

1. [Tweet about X platform updates] - High engagement with 2.3M views
2. [SpaceX mission announcement] - 1.8M views, discussing Mars mission
3. [AI development commentary] - 1.5M views, discussing AGI progress
4. [Tesla production update] - 1.2M views, manufacturing milestone
5. [Meme tweet] - 980K views, general humor content

The timeline shows a mix of business updates, technical discussions, and
casual engagement with the community. Average engagement is very high.
============================================================

✅ Done!
```

## Code Structure

### Main Components

1. **Teneo SDK Initialization (SDKConfigBuilder Pattern)**
   ```typescript
   import { SDKConfigBuilder, TeneoSDK } from '../../dist/index.js';

   // Load environment variables
   const WS_URL = process.env.WS_URL || '';
   const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
   const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '';
   const DEFAULT_ROOM = process.env.DEFAULT_ROOM || 'general';
   const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
   const ENABLE_SIG_VERIFICATION = process.env.ENABLE_SIGNATURE_VERIFICATION === 'true';
   const TRUSTED_ADDRESSES = process.env.TRUSTED_ADDRESSES?.split(',').filter(Boolean) || [];

   // Initialize SDK using builder pattern (recommended)
   const config = new SDKConfigBuilder()
     .withWebSocketUrl(WS_URL)
     .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)  // Wallet auto-derived if not provided
     .withRoom(DEFAULT_ROOM)
     .withReconnection({
       enabled: true,
       delay: 5000,
       maxAttempts: 10
     })
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

2. **Tool Definition with Zod Schema**
   ```typescript
   // Pass Zod shape directly (ZodRawShape), not z.object()
   const getXTimelineTool = tool(
     'get_x_timeline',
     'Fetch X/Twitter timeline using Teneo X-Agent',
     {
       username: z.string().describe('X/Twitter username (without @)'),
       count: z.number().min(1).max(100).default(20)
     },
     async (args) => {
       const { username, count } = args;

       // Find X-Agent
       const agents = teneoSDK.getAgents();
       const xAgent = agents.find(a =>
         a.name?.toLowerCase().includes('x') ||
         a.id?.toLowerCase().includes('x')
       );

       if (!xAgent) {
         throw new Error('X-Agent not found. Is it running in the room?');
       }

       // Send direct command with waitForResponse
       const response = await teneoSDK.sendDirectCommand({
         agent: xAgent.id,
         command: `timeline @${username} ${count}`,
         room: DEFAULT_ROOM
       }, true);  // waitForResponse = true

       return {
         content: [{
           type: 'text',
           text: JSON.stringify({
             success: true,
             timeline: response.humanized
           })
         }]
       };
     }
   );
   ```

   **Key Features:**
   - Uses `sendDirectCommand` with `waitForResponse: true` for reliable response handling
   - SDK automatically handles message correlation with fallback matching
   - Typical response time: **2-3 seconds**
   - No manual event listener management needed

3. **Create MCP Server and Query Claude**
   ```typescript
   // Create MCP server with the tool
   const teneoMcpServer = createSdkMcpServer({
     name: 'TeneoXAgent',
     version: '1.0.0',
     tools: [getXTimelineTool]
   });

   // Query Claude - uses local Claude CLI authentication by default
   const result = query({
     prompt: 'Get timeline for elonmusk and summarize',
     options: {
       model: 'claude-3-5-haiku-20241022',
       pathToClaudeCodeExecutable: process.env.HOME + '/.claude/local/claude',
       permissionMode: 'bypassPermissions',  // Allow tool use without prompts
       mcpServers: {
         teneo: teneoMcpServer
       }
     }
   });

   // Stream the response
   for await (const message of result) {
     if (message.type === 'result') {
       console.log(message.result);
     }
   }
   ```

## Features

### Integration Features
- ✅ **Minimal Code**: ~220 lines of clean TypeScript
- ✅ **Type-Safe**: Full TypeScript support with Zod validation
- ✅ **Claude Agent SDK**: Direct integration with Anthropic's Agent SDK
- ✅ **MCP Server**: Uses Model Context Protocol for tool registration
- ✅ **Custom Tools**: Easy-to-define tools with Zod schemas
- ✅ **Fast Response**: Typical 2-3 second end-to-end response time
- ✅ **Extensible**: Easy to add more tools and capabilities

### Modern SDK Features
- ✅ **Modern SDK Pattern**: Uses SDKConfigBuilder for clean configuration
- ✅ **Reliable Messaging**: SDK-level fallback matching for message correlation
- ✅ **Auto-Reconnection**: Automatic reconnection with exponential backoff
- ✅ **Message Caching**: Agent response caching for better performance
- ✅ **Signature Verification**: Optional SEC-2 message signature verification
- ✅ **Wallet Auto-Derivation**: Automatic wallet address derivation from private key
- ✅ **Error Handling**: Comprehensive error management
- ✅ **Async/Await**: Modern async patterns with `waitForResponse`
- ✅ **Configurable**: Environment-based configuration with 15+ options

## Extending the Example

### Add More Tools

```typescript
const analyzeUserTool = {
  name: 'analyze_x_user',
  description: 'Analyze X user profile and metrics',
  input_schema: { /* ... */ }
};

const compareUsersTool = {
  name: 'compare_x_users',
  description: 'Compare two X users',
  input_schema: { /* ... */ }
};

const agent = new Agent({
  tools: [getXTimelineTool, analyzeUserTool, compareUsersTool],
  // ...
});
```

### Add Event Listeners

```typescript
teneoSDK.on('agent:response', (response) => {
  console.log('Received response from Teneo agent');
});

teneoSDK.on('error', (error) => {
  console.error('Teneo error:', error);
});
```

## Troubleshooting

### Connection Issues

```bash
# Test Teneo connection first
npx tsx -e "
import { SDKConfigBuilder, TeneoSDK } from './dist/index.js';
const config = new SDKConfigBuilder()
  .withWebSocketUrl('wss://...')
  .withAuthentication('0x...')
  .withLogging('info')
  .build();
const sdk = new TeneoSDK(config);
await sdk.connect();
console.log('Connected!');
"
```

### Message Format Errors

If you see errors like `"Agents should use TypeTaskResponse instead of TypeMessage"` (code: 400):

This is a **server-side protocol error** indicating the Teneo server expects a different message format. This typically happens when:
- The room is configured for agent-to-agent communication rather than consumer SDK communication
- The server has specific message type requirements for that room

**Solutions:**
1. Try a different room (e.g., `general` instead of `x-agent-enterprise-v2`)
2. Check with your Teneo administrator about the correct room configuration
3. Verify your wallet is whitelisted for the room you're trying to access

**Note:** This is not a problem with your SDK configuration - the SDK is working correctly!

### Claude API Issues

- Verify `ANTHROPIC_API_KEY` is set correctly
- Check API key has sufficient credits
- Ensure using correct model name

### X-Agent Not Responding

**Note:** The SDK now includes **intelligent fallback matching** that resolves most timeout issues automatically!

If you still see timeout errors like `Message timeout - no response received after 10000ms`, here's how to diagnose:

**Step 1: Check if X-Agent is running**
```javascript
import { SDKConfigBuilder, TeneoSDK } from './dist/index.js';

const config = new SDKConfigBuilder()
  .withWebSocketUrl(process.env.WS_URL)
  .withAuthentication(process.env.PRIVATE_KEY)
  .withRoom('general')
  .build();

const sdk = new TeneoSDK(config);
await sdk.connect();

// Check available agents
const agents = sdk.getAgents();
console.log('Agents:', agents.length);
agents.forEach(agent => console.log(`  - ${agent.name}`));

// If agents.length === 0, no agents are running!
```

**Step 2: Verify Room ID**
```javascript
// List all available rooms
const rooms = sdk.getRooms();
rooms.forEach(room => {
  console.log(`ID: "${room.id}", Name: ${room.name}`);
});

// Make sure you're using the correct room ID
// Example: 'x-agent-enterprise-v2' for KOL tracker room
```

**Step 3: Common Issues**
- ❌ **No agents running**: X-Agent must be deployed and active in the room
- ❌ **Wrong room**: Default room must be set to the room where X-Agent is running
- ❌ **Wrong command format**: X-Agent expects `timeline @username count`
- ❌ **Authentication issues**: Verify your wallet has permission to access the room

**Step 4: Test with a simple message**
```bash
npx tsx -e "
import { SDKConfigBuilder, TeneoSDK } from './dist/index.js';
const config = new SDKConfigBuilder()
  .withWebSocketUrl('wss://...')
  .withAuthentication('0x...')
  .withRoom('general')
  .withLogging('info')
  .build();
const sdk = new TeneoSDK(config);
await sdk.connect();
const response = await sdk.sendMessage('Hello from Teneo SDK', {
  waitForResponse: true,
  timeout: 15000
});
console.log('Response:', response);
sdk.disconnect();
"
```

## SDK Improvements

This example benefits from recent SDK improvements:

### 1. Intelligent Fallback Matching

The SDK now includes **two-tier message correlation**:

**Primary Matching:** Uses `client_request_id` when server supports it
```typescript
const responseRequestId = r.raw?.data?.client_request_id;
if (responseRequestId === requestId) {
  return true;  // Match found!
}
```

**Fallback Matching:** Uses room + time window when server doesn't support request IDs
```typescript
// If server doesn't echo client_request_id,
// match first response from expected room within 60 seconds
const timeSinceRequest = Date.now() - requestTimestamp;
const isFromExpectedRoom = responseRoom === message.room;
const isWithinTimeWindow = timeSinceRequest < 60000;

if (isFromExpectedRoom && isWithinTimeWindow && !responseRequestId) {
  return true;  // Fallback match!
}
```

**Benefits:**
- Works with servers that don't support `client_request_id` echoing
- Typical response time: 2-3 seconds
- No manual event listener management
- Automatic retry and backoff

### 2. Enhanced Regular Message Handling

The SDK now properly handles both "message" and "task_response" types:

```typescript
// RegularMessageHandler now includes raw field for correlation
const response: AgentResponse = {
  taskId: message.data?.task_id || `msg-${Date.now()}`,
  agentId: message.from,
  content: message.content,
  raw: message as any,  // ← Critical for request correlation
  humanized: message.content
};
```

**Result:** X-Agent responses (which use "message" type) now work seamlessly with `waitForResponse: true`.

## Related Examples

- [OpenAI Codex + Teneo](../openai-teneo/) - Intelligent agent routing with Codex
- [n8n + Teneo](../n8n-teneo/) - Visual workflow automation
- [Production Dashboard](../production-dashboard/) - Full-featured dashboard

### Comparison

| Feature | Claude Agent | OpenAI Codex | n8n |
|---------|--------------|--------------|-----|
| **Interface** | CLI Tool | REST API | Visual Workflows |
| **AI Model** | Claude 3.5 | OpenAI Codex | N/A (HTTP only) |
| **Tool Pattern** | Custom MCP Tools | Agent Selection | Manual Endpoints |
| **Use Case** | Developer Tool | API Integration | Automation |
| **Complexity** | ~220 lines | ~280 lines | ~180 lines |
| **Response Time** | 2-3 seconds | 2-3 seconds | 2-3 seconds |

**Note:** All examples use the same **modern SDKConfigBuilder pattern** with:
- ✅ Automatic wallet derivation from private key
- ✅ Auto-reconnection with exponential backoff
- ✅ Agent response caching for performance
- ✅ Optional SEC-2 signature verification
- ✅ **SDK-level fallback matching for reliable message correlation**
- ✅ Comprehensive environment-based configuration

## License

MIT
