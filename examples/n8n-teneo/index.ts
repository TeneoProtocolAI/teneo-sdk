/**
 * Minimal example: Teneo Consumer SDK + n8n Integration
 *
 * Simple REST API for n8n workflows to query Teneo agents.
 *
 * Features:
 * - POST /query - Send messages to Teneo coordinator or specific agents
 * - GET /agents - List all available agents
 * - GET /health - Health check endpoint
 *
 * The /query endpoint supports:
 * - Automatic agent selection via coordinator (default)
 * - Direct agent commands (when agent parameter is provided)
 * - Event-based response handling for reliable message delivery
 */

import 'dotenv/config';
import express from 'express';
import { SDKConfigBuilder, TeneoSDK } from '../../dist/index.js';

// Load environment variables
const WS_URL = process.env.WS_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '';
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || 'general';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error' | 'silent';
const ENABLE_SIG_VERIFICATION = process.env.ENABLE_SIGNATURE_VERIFICATION === 'true';
const TRUSTED_ADDRESSES = process.env.TRUSTED_ADDRESSES?.split(',').filter(Boolean) || [];
const ENABLE_CACHE = process.env.ENABLE_CACHE !== 'false';
const CACHE_TIMEOUT = parseInt(process.env.CACHE_TIMEOUT || '300000');
const MAX_CACHE_SIZE = parseInt(process.env.MAX_CACHE_SIZE || '100');
const ENABLE_RECONNECTION = process.env.ENABLE_RECONNECTION !== 'false';
const RECONNECT_DELAY = parseInt(process.env.RECONNECT_DELAY || '5000');
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10');

// Validate required environment variables
if (!WS_URL || !PRIVATE_KEY) {
  console.error('Missing required environment variables: WS_URL, PRIVATE_KEY');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Initialize Teneo SDK using SDKConfigBuilder pattern
const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)  // Wallet auto-derived if not provided
  .withRoom(DEFAULT_ROOM)
  .withReconnection({
    enabled: ENABLE_RECONNECTION,
    delay: RECONNECT_DELAY,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  })
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

const teneoSDK = new TeneoSDK(config);

// Connect to Teneo
console.log('📡 Connecting to Teneo network...');
await teneoSDK.connect();
console.log('✅ Connected to Teneo\n');

// Health endpoint
app.get('/health', (req, res) => {
  const health = teneoSDK.getHealth();
  res.json({
    status: 'ok',
    teneo: {
      connected: health.connection.status === 'connected',
      authenticated: health.connection.authenticated
    }
  });
});

// Query endpoint - send message to Teneo coordinator or specific agent
app.post('/query', async (req, res) => {
  try {
    const { message, agent, timeout = 30000 } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`\n🔍 Query: ${message}${agent ? ` (to agent: ${agent})` : ' (via coordinator)'}`);

    let response: any;

    // Send message either to specific agent or via coordinator
    // Use the SDK's built-in waitForResponse feature with the improved fallback matching
    if (agent) {
      // Direct command to specific agent
      console.log(`🎯 Sending direct command to agent: ${agent}`);
      response = await teneoSDK.sendDirectCommand({
        agent,
        command: message,
        room: DEFAULT_ROOM
      }, true);  // waitForResponse = true
    } else {
      // Send via coordinator (coordinator will select best agent)
      console.log('📡 Sending message via coordinator');
      response = await teneoSDK.sendMessage(message, {
        waitForResponse: true,
        timeout
      });
    }

    if (!response || !response.humanized) {
      console.log('⚠️  No response data received');
      return res.json({
        success: false,
        error: 'No response from agent'
      });
    }

    console.log('📨 Response received from agent');
    console.log(`✅ Response successfully processed\n`);

    res.json({
      success: true,
      data: {
        humanized: response.humanized,
        raw: response.raw,
        metadata: response.metadata
      }
    });
  } catch (error) {
    console.error('❌ Query error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List agents endpoint
app.get('/agents', (_req, res) => {
  const agents = teneoSDK.getAgents();
  res.json({
    success: true,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities
    }))
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Teneo Service running on http://localhost:${PORT}`);
  console.log(`   Health: GET  http://localhost:${PORT}/health`);
  console.log(`   Query:  POST http://localhost:${PORT}/query`);
  console.log(`           Body: { "message": "your query", "agent": "optional-agent-id", "timeout": 30000 }`);
  console.log(`   Agents: GET  http://localhost:${PORT}/agents\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  teneoSDK.disconnect();
  teneoSDK.destroy();
  process.exit(0);
});
