/**
 * executeCommand example — roomless one-shot direct agent invocation.
 *
 * executeCommand is the quickest path to hit a specific agent when you:
 *   - know the agent id up front
 *   - don't need chat history / multi-turn context
 *   - are building a programmatic or CLI consumer, not a chat UI
 *
 * The call is ephemeral on the server: no room is created, no message is
 * broadcast to room subscribers, and no history is persisted. Payments work
 * exactly as they do for sendDirectCommand — if payments are enabled on the
 * server, the SDK transparently performs the quote → auto-confirm handshake.
 *
 * Usage:
 *   PRIVATE_KEY=0x... AGENT_ID=x-agent-enterprise-v2 COMMAND="user @elonmusk" \
 *     pnpm tsx examples/execute-command.ts
 *
 * Optional:
 *   NETWORK=base          — pay on a specific network for this call
 *   WAIT=false            — fire-and-forget instead of awaiting the response
 */

import { TeneoSDK, SDKConfigBuilder, SecurePrivateKey } from "../src";

const WS_URL = process.env.WS_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const AGENT_ID = process.env.AGENT_ID || "";
const COMMAND = process.env.COMMAND || "";
const NETWORK = process.env.NETWORK;
const WAIT = process.env.WAIT !== "false";

async function main() {
  if (!PRIVATE_KEY || !AGENT_ID || !COMMAND) {
    console.error(
      "Missing required env vars. Usage:\n" +
        '  PRIVATE_KEY=0x... AGENT_ID=<agent> COMMAND="..." pnpm tsx examples/execute-command.ts'
    );
    process.exit(1);
  }

  const secureKey = new SecurePrivateKey(PRIVATE_KEY);
  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey)
    .withReconnection({ enabled: false })
    .withLogging("warn")
    .build();

  const sdk = new TeneoSDK(config);

  try {
    console.log("Connecting...");
    await sdk.connect();
    console.log("Connected. Executing command (no room)...\n");

    const start = Date.now();
    const response = await sdk.executeCommand(
      {
        agent: AGENT_ID,
        command: COMMAND,
        ...(NETWORK ? { network: NETWORK } : {})
      },
      WAIT
    );
    const ms = Date.now() - start;

    if (!WAIT) {
      console.log(`Sent in ${ms}ms (fire-and-forget; no response awaited).`);
      return;
    }

    if (response && typeof response === "object") {
      const r = response as { humanized?: string; content?: string };
      console.log(`Reply (${ms}ms):\n${r.humanized ?? r.content ?? JSON.stringify(response)}`);
    } else {
      console.log(`(no response, ${ms}ms)`);
    }
  } catch (err) {
    console.error("executeCommand failed:", err);
    process.exitCode = 1;
  } finally {
    sdk.disconnect();
    sdk.destroy();
  }
}

main();
