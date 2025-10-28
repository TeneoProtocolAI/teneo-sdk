# Quick Start Guide

Get up and running with Claude Agent + Teneo SDK in 5 minutes.

## Step 1: Install Dependencies

```bash
# Install Claude Agent SDK
npm install @anthropic-ai/claude-agent-sdk

# Install tsx for running TypeScript
npm install -g tsx

# Ensure Teneo SDK is built
npm run build
```

## Step 2: Configure Environment

Copy the example environment file:

```bash
cp examples/claude-agent-x-follower/.env.example examples/claude-agent-x-follower/.env
```

Edit `.env` with your credentials:

```env
# Required: Teneo Network Connection
WS_URL=wss://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/ws
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
WALLET_ADDRESS=0x1234567890123456789012345678901234567890  # Optional - auto-derived

# Required: Room Configuration
DEFAULT_ROOM=general  # or x-agent-enterprise-v2 for X features

# Optional: Claude API Key (if not using Claude Code CLI)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Advanced Configuration (defaults shown)
ENABLE_SIGNATURE_VERIFICATION=false
TRUSTED_ADDRESSES=
ENABLE_CACHE=true
ENABLE_RECONNECTION=true
LOG_LEVEL=info
```

**Key Configuration Notes:**
- `WALLET_ADDRESS` is optional - automatically derived from `PRIVATE_KEY` if not provided
- `ANTHROPIC_API_KEY` only needed if Claude Code CLI is not authenticated
- `DEFAULT_ROOM` set to `general` for basic use, `x-agent-enterprise-v2` for X/Twitter features
- All performance and security settings have sensible defaults

## Step 3: Run the Example

### Using npm script:

```bash
npm run example:claude
```

### Using tsx directly:

```bash
npx tsx examples/claude-agent-x-follower/index.ts
```

### With custom prompt:

```bash
npx tsx examples/claude-agent-x-follower/index.ts "Get timeline for VitalikButerin and analyze sentiment"
```

## Expected Output

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
I've retrieved the timeline for @elonmusk. Here's a summary...
============================================================

✅ Done!
```

## Troubleshooting

### Issue: Module not found

```bash
# Make sure Claude Agent SDK is installed
npm install @anthropic-ai/claude-agent-sdk

# Ensure SDK is built
npm run build
```

### Issue: Cannot connect to Teneo

```bash
# Check your environment variables
cat examples/claude-agent-x-follower/.env | grep WS_URL
cat examples/claude-agent-x-follower/.env | grep PRIVATE_KEY

# Verify the WebSocket URL is accessible
# Ensure your PRIVATE_KEY starts with 0x
```

### Issue: Wallet not whitelisted

If you see: `"🔒 Access restricted: Your wallet is not whitelisted"`

**Solution:** Contact your Teneo administrator to whitelist your wallet address for the room you're trying to access.

### Issue: "Agents should use TypeTaskResponse instead of TypeMessage"

This is a **server-side protocol error** (not a configuration issue).

**Solutions:**
1. Try `DEFAULT_ROOM=general` instead of `x-agent-enterprise-v2`
2. Contact your Teneo administrator about room configuration
3. Verify your wallet has correct permissions

### Issue: Claude API error

```bash
# Verify your API key
cat examples/claude-agent-x-follower/.env | grep ANTHROPIC_API_KEY

# Check API key has credits at: https://console.anthropic.com/
```

**Alternative:** Use Claude Code CLI authentication (no API key needed):
- Already configured via `pathToClaudeCodeExecutable` in the code
- Uses your local `~/.claude/.credentials.json`

## Next Steps

- ✅ Read the [full README](./README.md) for detailed documentation
- ✅ Modify prompts to analyze different X users
- ✅ Add more tools to the Claude agent
- ✅ Integrate with your own application

## Example Prompts to Try

```bash
# General information (works in 'general' room)
npx tsx examples/claude-agent-x-follower/index.ts "Give me information about Teneo Protocol"

# X/Twitter analysis (requires x-agent-enterprise-v2 room and whitelisting)
npx tsx examples/claude-agent-x-follower/index.ts "Get timeline for elonmusk and analyze sentiment"

# Topic research
npx tsx examples/claude-agent-x-follower/index.ts "What is the latest news about AI agents?"

# Compare users (X-Agent features)
npx tsx examples/claude-agent-x-follower/index.ts "Compare tweet styles of elonmusk and VitalikButerin"

# Engagement analysis (X-Agent features)
npx tsx examples/claude-agent-x-follower/index.ts "Which of AndrewYNg's recent tweets got most engagement?"
```

**Note:** X/Twitter timeline features (`get_x_timeline` tool) require:
- Room set to `x-agent-enterprise-v2`
- Wallet whitelisted for X-Agent access
- Active X-Agent running in the room

For general testing, use `DEFAULT_ROOM=general` and non-timeline prompts.

## Architecture Overview

```
You (Prompt) → Claude Agent → get_x_timeline (Tool) → Teneo SDK → X-Agent → Twitter/X
                    ↓
              Analysis & Response
```

## What's New in This Version

This example now uses the **modern SDKConfigBuilder pattern** with enhanced features:

### ✨ Key Features

1. **Automatic Wallet Derivation**
   - No need to manually provide wallet address
   - Automatically derived from your private key using viem

2. **Auto-Reconnection**
   - Automatic reconnection with exponential backoff
   - Configurable retry attempts and delays
   - Handles network interruptions gracefully

3. **Response Caching**
   - Agent response caching for better performance
   - Configurable cache timeout and size
   - Reduces redundant queries

4. **Security Features**
   - Optional SEC-2 message signature verification
   - Trusted address whitelisting
   - Configurable security policies

5. **Flexible Configuration**
   - Environment-based configuration
   - Sensible defaults for all settings
   - Easy to customize per environment

### 🔧 Configuration Pattern

The example uses `SDKConfigBuilder` for clean, type-safe configuration:

```typescript
const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)  // Wallet auto-derived
  .withRoom(DEFAULT_ROOM)
  .withReconnection({ enabled: true, delay: 5000, maxAttempts: 10 })
  .withCache(true, 300000, 100)
  .withSignatureVerification({ enabled: false, trustedAddresses: [] })
  .build();
```

This replaces the old direct object initialization pattern and provides better IDE support and validation.

---

That's it! You're ready to build AI-powered tools with Claude Agent and Teneo SDK.
