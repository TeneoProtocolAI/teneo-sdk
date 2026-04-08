/**
 * Investigate WebSocket payload sizes from the Teneo server
 * Run with: npx tsx scripts/investigate-payload.ts
 */

import WebSocket from "ws";
import { privateKeyToAccount } from "viem/accounts";

const WS_URL = process.env.TENEO_WS_URL || "wss://backend.developer.chatroom.teneo-protocol.ai/ws";

// Set via environment variable
const TEST_PRIVATE_KEY = process.env.TENEO_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE";

console.log("Connecting to:", WS_URL);
console.log("Max payload set to 10MB\n");

const account = privateKeyToAccount(TEST_PRIVATE_KEY);
console.log("Wallet address:", account.address, "\n");

const ws = new WebSocket(WS_URL, {
  maxPayload: 10 * 1024 * 1024 // 10MB max
});

let messageCount = 0;
let totalBytes = 0;
const messageSizes: { type: string; size: number; preview: string }[] = [];
let authStarted = false;

ws.on("open", () => {
  console.log("✅ Connected\n");
});

ws.on("message", async (data: Buffer) => {
  messageCount++;
  const size = data.length;
  totalBytes += size;

  let parsed: any;
  let type = "unknown";
  let preview = "";

  try {
    parsed = JSON.parse(data.toString());
    type = parsed.type || parsed.action || "json";

    if (parsed.type === "room_history") {
      const historyLength = parsed.data?.history?.length || 0;
      preview = `${historyLength} messages in history`;
    } else if (parsed.type === "auth_success") {
      preview = `wallet: ${parsed.data?.address?.substring(0, 10)}...`;
    } else if (parsed.type === "challenge") {
      preview = `challenge: ${parsed.data?.challenge?.substring(0, 20)}...`;
    } else {
      preview = JSON.stringify(parsed).substring(0, 100);
    }
  } catch {
    preview = data.toString().substring(0, 100);
  }

  const sizeStr = formatBytes(size);
  messageSizes.push({ type, size, preview });

  console.log(`Message #${messageCount}: ${type}`);
  console.log(`  Size: ${sizeStr}`);
  console.log(`  Preview: ${preview}`);
  console.log("");

  // Handle auth flow using correct SDK message format
  if (parsed?.type === "auth_required" && !authStarted) {
    authStarted = true;
    console.log("📤 Requesting challenge...\n");
    ws.send(
      JSON.stringify({
        type: "request_challenge",
        data: {
          userType: "user",
          address: account.address
        }
      })
    );
  } else if (parsed?.type === "challenge") {
    const challenge = parsed.data?.challenge;
    console.log("📤 Signing challenge and authenticating...\n");
    const messageToSign = `Teneo authentication challenge: ${challenge}`;
    const signature = await account.signMessage({ message: messageToSign });
    ws.send(
      JSON.stringify({
        type: "auth",
        data: {
          address: account.address,
          signature,
          message: messageToSign,
          userType: "user"
        }
      })
    );
  }

  // After receiving enough messages post-auth, close and summarize
  if (messageCount >= 15 || totalBytes > 100 * 1024 * 1024) {
    summarize();
    ws.close();
  }
});

ws.on("error", (err) => {
  console.error("❌ Error:", err.message);
});

ws.on("close", (code, reason) => {
  console.log(`\nConnection closed: ${code} ${reason}`);
  if (messageCount > 1) summarize();
  process.exit(0);
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function summarize() {
  console.log("\n" + "=".repeat(60));
  console.log("PAYLOAD SIZE INVESTIGATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total messages received: ${messageCount}`);
  console.log(`Total bytes received: ${formatBytes(totalBytes)}`);
  console.log("\nBy message type:");

  const byType: Record<string, { count: number; totalSize: number }> = {};
  for (const msg of messageSizes) {
    if (!byType[msg.type]) {
      byType[msg.type] = { count: 0, totalSize: 0 };
    }
    byType[msg.type].count++;
    byType[msg.type].totalSize += msg.size;
  }

  for (const [type, stats] of Object.entries(byType)) {
    console.log(`  ${type}: ${stats.count} messages, ${formatBytes(stats.totalSize)}`);
  }

  console.log("\nLargest messages:");
  const sorted = [...messageSizes].sort((a, b) => b.size - a.size).slice(0, 5);
  for (const msg of sorted) {
    console.log(`  ${msg.type}: ${formatBytes(msg.size)} - ${msg.preview.substring(0, 50)}`);
  }

  // Check if any message exceeded 2MB (original limit)
  const over2mb = messageSizes.filter((m) => m.size > 2 * 1024 * 1024);
  if (over2mb.length > 0) {
    console.log("\n⚠️  Messages exceeding original 2MB limit:");
    for (const msg of over2mb) {
      console.log(`  ${msg.type}: ${formatBytes(msg.size)}`);
    }
  } else {
    console.log("\n✅ No messages exceeded the original 2MB limit");
  }
}

// Timeout after 30 seconds
setTimeout(() => {
  console.log("\n⏰ Timeout - closing connection");
  summarize();
  ws.close();
  process.exit(0);
}, 30000);
