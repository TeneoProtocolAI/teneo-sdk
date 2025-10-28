/**
 * Minimal example: Teneo Consumer SDK + OpenAI Codex Integration
 *
 * Simple REST API that combines OpenAI Codex agents with Teneo agents.
 * Uses the OpenAI Codex SDK for thread-based conversations.
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { Codex } from '@openai/codex-sdk';
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Validate required environment variables
if (!WS_URL || !PRIVATE_KEY) {
  console.error('Missing required environment variables: WS_URL, PRIVATE_KEY');
  console.error('Note: OPENAI_API_KEY is optional - Codex SDK will use default auth if not provided');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Initialize Teneo SDK using SDKConfigBuilder pattern
const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)  // Wallet auto-derived if not provided
  .withAutoJoinRooms([DEFAULT_ROOM])
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

// Initialize Codex SDK
// Explicitly set the API key from environment
const codex = new Codex({
  apiKey: OPENAI_API_KEY || process.env.OPENAI_API_KEY
});

// Connect to Teneo
console.log('📡 Connecting to Teneo network...');
await teneoSDK.connect();
console.log('✅ Connected to Teneo\n');

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  const teneoHealth = teneoSDK.getHealth();
  res.json({
    status: 'ok',
    teneo: {
      connected: teneoHealth.connection.status === 'connected',
      authenticated: teneoHealth.connection.authenticated
    },
    codex: {
      initialized: true,
      apiKeyConfigured: !!OPENAI_API_KEY
    }
  });
});

// Query endpoint - Codex analyzes, then routes to Teneo agent
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`\n🔍 Query: ${message}`);

    // Step 1: Get available Teneo agents
    const agents = teneoSDK.getAgents();

    // Step 2: Ask Codex to select the best agent
    console.log('🤖 Asking Codex to select best agent...');

    const agentList = agents.map(a =>
      `- ${a.name}: ${a.description || 'No description'}`
    ).join('\n');

    const thread = codex.startThread();
    const codexResponse = await thread.run(
      `You are an agent coordinator. Select the most appropriate agent for the user's query.

Available agents:
${agentList}

User query: ${message}

Respond with ONLY the agent name, nothing else.`
    );

    // Extract text from Codex response
    // Codex SDK returns an object with finalResponse property
    let selectedAgentName: string;
    if (typeof codexResponse === 'string') {
      selectedAgentName = codexResponse.trim();
    } else if (codexResponse && typeof codexResponse === 'object') {
      // Extract from finalResponse property
      selectedAgentName = (codexResponse as any).finalResponse
        || (codexResponse as any).text
        || (codexResponse as any).content
        || String(codexResponse);
      if (typeof selectedAgentName === 'object') {
        selectedAgentName = JSON.stringify(selectedAgentName);
      }
      selectedAgentName = selectedAgentName.trim();
    } else {
      selectedAgentName = agents[0]?.name || '';
    }

    console.log(`✅ Selected agent: ${selectedAgentName}`);

    // Find the agent by name or ID
    const selectedAgent = agents.find(a =>
      a.name?.toLowerCase() === selectedAgentName.toLowerCase() ||
      a.id?.toLowerCase() === selectedAgentName.toLowerCase()
    );

    if (!selectedAgent) {
      return res.status(404).json({
        success: false,
        error: `Agent '${selectedAgentName}' not found. Available agents: ${agents.map(a => a.name || a.id).join(', ')}`
      });
    }

    // Step 3: Send direct command to selected Teneo agent (bypasses coordinator)
    // Use the SDK's built-in waitForResponse feature with the improved fallback matching
    console.log(`📤 Sending to Teneo agent: ${selectedAgent.name || selectedAgent.id}...`);
    const teneoResponse = await teneoSDK.sendDirectCommand({
      agent: selectedAgent.id,
      command: message,
      room: DEFAULT_ROOM
    }, true);  // waitForResponse = true

    if (!teneoResponse || !teneoResponse.humanized) {
      return res.json({
        success: false,
        error: 'No response from Teneo agent'
      });
    }

    console.log(`✅ Response received\n`);

    // Return combined response
    res.json({
      success: true,
      data: {
        query: message,
        selectedAgent: selectedAgent.name || selectedAgent.id,
        selectedAgentId: selectedAgent.id,
        response: teneoResponse.humanized,
        codexSelection: selectedAgentName,
        metadata: teneoResponse.metadata
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

// Direct Codex query (bypass Teneo)
app.post('/codex', async (req: Request, res: Response) => {
  try {
    const { message, threadId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`\n💬 Codex query: ${message}`);

    // Resume existing thread or start new one
    const thread = threadId ? codex.resumeThread(threadId) : codex.startThread();
    const codexResult = await thread.run(message);

    // Extract text from Codex response
    // Codex SDK returns an object with finalResponse property
    let responseText: string;
    if (typeof codexResult === 'string') {
      responseText = codexResult;
    } else if (codexResult && typeof codexResult === 'object') {
      responseText = (codexResult as any).finalResponse
        || (codexResult as any).text
        || (codexResult as any).content
        || JSON.stringify(codexResult);
    } else {
      responseText = String(codexResult);
    }

    res.json({
      success: true,
      data: {
        response: responseText,
        threadId: thread.id || 'new',
        usage: (codexResult as any).usage // Include token usage if available
      }
    });

  } catch (error) {
    console.error('❌ Codex error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List Teneo agents
app.get('/agents', (_req: Request, res: Response) => {
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
  console.log(`🚀 Codex + Teneo Service running on http://localhost:${PORT}`);
  console.log(`   Health:  GET  http://localhost:${PORT}/health`);
  console.log(`   Query:   POST http://localhost:${PORT}/query`);
  console.log(`            Body: { "message": "your query" }`);
  console.log(`   Codex:   POST http://localhost:${PORT}/codex`);
  console.log(`            Body: { "message": "your query", "threadId": "optional" }`);
  console.log(`   Agents:  GET  http://localhost:${PORT}/agents\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  teneoSDK.disconnect();
  teneoSDK.destroy();
  process.exit(0);
});
