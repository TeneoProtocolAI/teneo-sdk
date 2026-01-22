/**
 * Minimal Chat Example - Single file to test Teneo SDK
 * Lists rooms, lets you pick one, send a message, get a reply
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm tsx examples/minimal-chat.ts
 */

import * as readline from "readline";
import { TeneoSDK, SDKConfigBuilder, SecurePrivateKey } from "../src";

const WS_URL = process.env.WS_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, res));

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Missing PRIVATE_KEY. Run with: PRIVATE_KEY=0x... pnpm tsx examples/minimal-chat.ts");
    process.exit(1);
  }

  const secureKey = new SecurePrivateKey(PRIVATE_KEY);

  const config = new SDKConfigBuilder()
    .withWebSocketUrl(WS_URL)
    .withAuthentication(secureKey)
    .withReconnection({ enabled: false })
    .withResponseFormat({ format: "both" })
    .withLogging("warn")
    .build();

  const sdk = new TeneoSDK(config);

  // Show agent responses
  sdk.on("agent:response", (r) => {
    console.log(`\n[${r.agentName || "Agent"}]: ${r.humanized || r.content || JSON.stringify(r.raw)}`);
  });

  sdk.on("error", (e) => console.error("Error:", e.message));

  try {
    console.log("Connecting...");
    await sdk.connect();
    console.log("Connected!\n");

    // List rooms
    const rooms = sdk.getRooms();
    if (!rooms.length) {
      console.log("No rooms available.");
      return;
    }

    console.log("Available rooms:");
    rooms.forEach((room, i) => {
      console.log(`  ${i + 1}. ${room.name || room.id}${room.is_public ? "" : " (private)"}`);
    });

    // Pick a room
    const choice = await ask("\nEnter room number: ");
    const roomIdx = parseInt(choice, 10) - 1;
    if (isNaN(roomIdx) || roomIdx < 0 || roomIdx >= rooms.length) {
      console.log("Invalid choice.");
      return;
    }

    const selectedRoom = rooms[roomIdx];

    // Only public rooms need subscription - private rooms are auto-available after auth
    if (selectedRoom.is_public) {
      console.log(`\nSubscribing to "${selectedRoom.name || selectedRoom.id}"...`);
      await sdk.subscribeToRoom(selectedRoom.id);
      console.log("Subscribed!");
    } else {
      console.log(`\nUsing private room "${selectedRoom.name || selectedRoom.id}"...`);
    }
    console.log("Type messages below (Ctrl+C to exit)\n");

    // Chat loop
    while (true) {
      const message = await ask("You: ");
      if (!message.trim()) continue;

      console.log("Sending...");
      const response = await sdk.sendMessage(message, {
        room: selectedRoom.id,
        waitForResponse: true,
        timeout: 60000
      });

      if (response?.humanized) {
        console.log(`\nReply: ${response.humanized}\n`);
      } else if (response?.raw) {
        console.log(`\nReply: ${JSON.stringify(response.raw, null, 2)}\n`);
      } else {
        console.log("\n(No response)\n");
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    sdk.disconnect();
    sdk.destroy();
    rl.close();
  }
}

main();
