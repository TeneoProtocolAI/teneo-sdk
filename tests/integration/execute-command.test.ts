/**
 * Integration test for TeneoSDK.executeCommand — roomless one-shot execution.
 *
 * Verifies that:
 *   1. A fresh SDK instance can authenticate and immediately call
 *      executeCommand WITHOUT creating or joining any room.
 *   2. The call returns a FormattedResponse when waitForResponse is true.
 *   3. No room subscription or agent-room membership is required beforehand.
 *
 * Requires a running server and test credentials. Skips when credentials are
 * not provided (matches the pattern in real-server.test.ts).
 *
 * Env vars required:
 *   WS_URL / WEBSOCKET_URL
 *   WALLET_ADDRESS
 *   PRIVATE_KEY
 *   EXECUTE_COMMAND_AGENT_ID   — agent id to call (e.g. "x-agent-enterprise-v2")
 *   EXECUTE_COMMAND_TEXT       — command text (e.g. "user @elonmusk" or "help")
 *
 * Optional:
 *   EXECUTE_COMMAND_NETWORK    — per-request network override ("base", etc.)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TeneoSDK } from "../../src";
import { SDKConfigBuilder } from "../../src/types";
import type { AuthenticationState } from "../../src/types";

const CFG = {
  WS_URL: process.env.WS_URL || process.env.WEBSOCKET_URL || "",
  WALLET_ADDRESS: process.env.WALLET_ADDRESS || "",
  PRIVATE_KEY: (process.env.PRIVATE_KEY || "").replace(/^0x/, ""),
  AGENT_ID: process.env.EXECUTE_COMMAND_AGENT_ID || "",
  COMMAND: process.env.EXECUTE_COMMAND_TEXT || "",
  NETWORK: process.env.EXECUTE_COMMAND_NETWORK || undefined
};

const hasCredentials = !!(
  CFG.WS_URL &&
  CFG.WALLET_ADDRESS &&
  CFG.PRIVATE_KEY &&
  CFG.AGENT_ID &&
  CFG.COMMAND
);

describe.skipIf(!hasCredentials)("executeCommand integration (roomless)", () => {
  let sdk: TeneoSDK;

  beforeAll(async () => {
    const config = new SDKConfigBuilder()
      .withWebSocketUrl(CFG.WS_URL)
      .withAuthentication(CFG.PRIVATE_KEY, CFG.WALLET_ADDRESS)
      .withLogging("info")
      .withReconnection(false)
      .build();

    sdk = new TeneoSDK(config);

    await new Promise<AuthenticationState>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Auth timeout after 20s")),
        20000
      );
      sdk.once("auth:success", (state) => {
        clearTimeout(timeout);
        resolve(state);
      });
      sdk.once("auth:error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Auth failed: ${err}`));
      });
      sdk.connect().catch(reject);
    });

    expect(sdk.isAuthenticated).toBe(true);
  }, 30000);

  afterAll(() => {
    if (sdk) sdk.disconnect();
  });

  it("returns a response without creating or joining a room", async () => {
    const response = await sdk.executeCommand(
      {
        agent: CFG.AGENT_ID,
        command: CFG.COMMAND,
        ...(CFG.NETWORK ? { network: CFG.NETWORK } : {})
      },
      true
    );

    expect(response).toBeDefined();
    // FormattedResponse has either content or humanized — assert at least one.
    const r = response as { content?: string; humanized?: string };
    const text = r.humanized ?? r.content ?? "";
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  }, 60000);

  it("can be invoked multiple times back-to-back on the same connection", async () => {
    const first = await sdk.executeCommand(
      { agent: CFG.AGENT_ID, command: CFG.COMMAND },
      true
    );
    const second = await sdk.executeCommand(
      { agent: CFG.AGENT_ID, command: CFG.COMMAND },
      true
    );
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  }, 120000);
});
