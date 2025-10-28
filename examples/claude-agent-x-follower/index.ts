/**
 * Minimal example: Claude Agent SDK + Teneo Consumer SDK
 *
 * This example demonstrates how to:
 * 1. Create a Claude Agent with a custom tool
 * 2. Use the tool to call Teneo SDK and fetch X/Twitter timelines
 * 3. Return structured results to Claude
 */

import 'dotenv/config';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
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
  console.error('Missing required environment variables');
  console.error('Required: WS_URL, PRIVATE_KEY');
  console.error('Note: ANTHROPIC_API_KEY is optional if Claude CLI is authenticated');
  process.exit(1);
}

// Initialize Teneo SDK using SDKConfigBuilder pattern
const config = new SDKConfigBuilder()
  .withWebSocketUrl(WS_URL)
  .withAuthentication(PRIVATE_KEY, WALLET_ADDRESS)
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

// Define the tool for Claude Agent
// Note: Pass Zod shape directly (ZodRawShape), not z.object()
const getXTimelineTool = tool(
  'get_x_timeline',
  'Fetch X/Twitter timeline for a given username using Teneo X-Agent. Returns recent tweets and engagement data.',
  {
    username: z.string().describe('X/Twitter username (without @)'),
    count: z.number().min(1).max(100).default(20).describe('Number of tweets to fetch')
  },
  async (args) => {
    const { username, count } = args;

    console.log('\n' + '='.repeat(60));
    console.log('🔧 TOOL INVOKED: get_x_timeline');
    console.log('='.repeat(60));
    console.log(`📥 Input: username="${username}", count=${count}`);
    console.log(`\n🔍 Fetching timeline for @${username} (${count} tweets)...\n`);

    try {
      // Get available agents to find the X Platform Agent
      const agents = teneoSDK.getAgents();
      console.log(`📋 Found ${agents.length} available agents`);

      // Find X Platform Agent by name or ID
      const xAgent = agents.find(a =>
        a.name?.toLowerCase().includes('x platform agent') ||
        a.id?.toLowerCase().includes('x-agent-enterprise-v2')
      );

      if (!xAgent) {
        console.error('❌ X Platform Agent not found in available agents');
        console.log('Available agents:', agents.map(a => ({ id: a.id, name: a.name })));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'X Platform Agent not found. Available agents: ' + agents.map(a => a.name || a.id).join(', ')
            })
          }]
        };
      }

      console.log(`🎯 Using agent: ${xAgent.name || xAgent.id}`);

      // Send direct command to X-Agent (bypasses coordinator)
      // We pre-selected the X Platform Agent, so we use sendDirectCommand()
      // instead of sendMessage() to send directly to this specific agent
      const waitForResponse = true;
      const response = await teneoSDK.sendDirectCommand({
        agent: xAgent.id,
        command: `timeline @${username} ${count}`,
        room: DEFAULT_ROOM
      }, waitForResponse);

      console.log('📨 Received response from Teneo:', response ? 'Yes' : 'No');

      if (!response?.humanized) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'No response from X-Agent'
            })
          }]
        };
      }

      console.log(`✅ Successfully fetched timeline for @${username}\n`);

      // Return the timeline data in Claude's expected format
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            username: username,
            count: count,
            timeline: response.humanized,
            raw_data: response.raw
          }, null, 2)
        }]
      };

    } catch (error) {
      console.error('Error fetching timeline:', error);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }]
      };
    }
  }
);

// Create MCP server with the tool
const teneoMcpServer = createSdkMcpServer({
  name: 'TeneoXAgent',
  version: '1.0.0',
  tools: [getXTimelineTool]
});

// Main function
async function main() {
  console.log('🤖 Claude Agent + Teneo SDK - X Timeline Follower\n');

  // Connect to Teneo
  console.log('📡 Connecting to Teneo network...');
  await teneoSDK.connect();
  console.log('✅ Connected to Teneo\n');

  // Get prompt from command line or use default
  const userPrompt = process.argv[2] ||
    'Use the get_x_timeline tool to get the timeline for elonmusk for 5 tweets';

  console.log(`💬 Prompt: "${userPrompt}"\n`);
  console.log('🧠 Claude is processing...\n');

  try {
    // Query Claude with the custom tool
    // API key is read from ANTHROPIC_API_KEY environment variable
    const result = query({
      prompt: userPrompt,
      options: {
        model: 'claude-3-5-haiku-20241022',
        pathToClaudeCodeExecutable: process.env.HOME + '/.claude/local/claude',
        permissionMode: 'bypassPermissions',  // Allow tool use without asking
        mcpServers: {
          teneo: teneoMcpServer
        }
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('📝 CLAUDE RESPONSE:');
    console.log('='.repeat(60));

    // Stream the response
    for await (const message of result) {
      if (message.type === 'result') {
        // Show the final result in a readable format
        console.log('\n📊 Final Result:');

        // Check if it's an error result
        if (message.is_error) {
          console.log('❌ Error occurred during execution');
          console.log(message);
        } else {
          // Success result - TypeScript narrows the type here
          console.log((message as any).result || 'No result returned');
        }

        console.log(`\n⏱️  Duration: ${message.duration_ms}ms`);
        console.log(`💰 Cost: $${message.total_cost_usd.toFixed(6)}`);
        console.log(`🔄 Turns: ${message.num_turns}`);
      } else {
        // Show other messages for debugging
        console.log(message);
      }
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Claude query error:', error);
  } finally {
    // Cleanup
    teneoSDK.disconnect();
    teneoSDK.destroy();
    console.log('✅ Done!\n');

    // Force exit to prevent hanging
    setTimeout(() => process.exit(0), 500);
  }
}

// Run with error handling
main().catch((error) => {
  console.error('\n❌ Error:', error);
  teneoSDK.disconnect();
  teneoSDK.destroy();
  process.exit(1);
});
