/**
 * Unit tests for TeneoSDK.setApiKeyPreference() and TeneoSDK.sendTxResult()
 * Tests message shape, destroyed state, and connection state checks
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TeneoSDK } from "../../src/teneo-sdk";
import { ErrorCode } from "../../src/types/error-codes";

// Mock the networks module so we can control CHAIN_ID_TO_NETWORK
vi.mock("../../src/payments/networks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/payments/networks")>();
  return {
    ...actual,
    CHAIN_ID_TO_NETWORK: {} as Record<number, string>
  };
});

import { CHAIN_ID_TO_NETWORK } from "../../src/payments/networks";

describe("TeneoSDK New Methods", () => {
  let sdk: TeneoSDK;
  let sendMessageSpy: ReturnType<typeof vi.fn>;
  let mockWsClient: { isConnected: boolean; sendMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Create SDK with minimal config
    sdk = new TeneoSDK({ wsUrl: "wss://test.teneo.example.com" });

    // Replace the internal wsClient with a mock that has a writable isConnected
    sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    mockWsClient = {
      isConnected: true,
      sendMessage: sendMessageSpy
    };
    (sdk as any).wsClient = mockWsClient;
  });

  describe("setApiKeyPreference", () => {
    it("should send correct message shape with useCustomKeys=true", async () => {
      await sdk.setApiKeyPreference(true);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "set_api_key_preference",
        data: {
          use_custom_keys: true
        }
      });
    });

    it("should send correct message shape with useCustomKeys=false", async () => {
      await sdk.setApiKeyPreference(false);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "set_api_key_preference",
        data: {
          use_custom_keys: false
        }
      });
    });

    it("should throw SDKError when destroyed", async () => {
      (sdk as any).isDestroyed = true;

      await expect(sdk.setApiKeyPreference(true)).rejects.toThrow("SDK has been destroyed");

      try {
        await sdk.setApiKeyPreference(true);
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.SDK_DESTROYED);
      }
    });

    it("should throw SDKError when not connected", async () => {
      (sdk as any).wsClient.isConnected = false;

      await expect(sdk.setApiKeyPreference(true)).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );

      try {
        await sdk.setApiKeyPreference(true);
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.NOT_CONNECTED);
      }
    });

    it("should not call sendMessage when destroyed", async () => {
      (sdk as any).isDestroyed = true;

      try {
        await sdk.setApiKeyPreference(true);
      } catch {
        // Expected
      }

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it("should not call sendMessage when not connected", async () => {
      (sdk as any).wsClient.isConnected = false;

      try {
        await sdk.setApiKeyPreference(false);
      } catch {
        // Expected
      }

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("sendTxResult", () => {
    it("should send correct message with confirmed status and txHash", async () => {
      await sdk.sendTxResult("task-123", "confirmed", "0xabc123");

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        timestamp: expect.any(String),
        data: {
          task_id: "task-123",
          status: "confirmed",
          tx_hash: "0xabc123"
        }
      });
    });

    it("should send correct message with failed status and error", async () => {
      await sdk.sendTxResult("task-456", "failed", undefined, "Insufficient funds");

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        timestamp: expect.any(String),
        data: {
          task_id: "task-456",
          status: "failed",
          error: "Insufficient funds"
        }
      });
    });

    it("should send correct message with rejected status", async () => {
      await sdk.sendTxResult("task-789", "rejected");

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        timestamp: expect.any(String),
        data: {
          task_id: "task-789",
          status: "rejected"
        }
      });
    });

    it("should include room when provided", async () => {
      await sdk.sendTxResult("task-100", "confirmed", "0xhash", undefined, "room-abc");

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        room: "room-abc",
        timestamp: expect.any(String),
        data: {
          task_id: "task-100",
          status: "confirmed",
          tx_hash: "0xhash"
        }
      });
    });

    it("should format txHash with network name when chainId is provided", async () => {
      // Populate the chain ID mapping like fetchNetworkConfigs would
      const chainMap = CHAIN_ID_TO_NETWORK as Record<number, string>;
      chainMap[8453] = "base";
      chainMap[43114] = "avalanche";

      await sdk.sendTxResult("task-100", "confirmed", "0xabc", undefined, "room-abc", 8453);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        room: "room-abc",
        timestamp: expect.any(String),
        data: {
          task_id: "task-100",
          status: "confirmed",
          tx_hash: "0xabc|base"
        }
      });

      // Cleanup
      delete chainMap[8453];
      delete chainMap[43114];
    });

    it("should send raw txHash when chainId is unknown", async () => {
      await sdk.sendTxResult("task-100", "confirmed", "0xabc", undefined, "room-abc", 99999);

      const sentMessage = sendMessageSpy.mock.calls[0][0];
      expect(sentMessage.data.tx_hash).toBe("0xabc");
    });

    it("should not include room when not provided", async () => {
      await sdk.sendTxResult("task-100", "rejected");

      const sentMessage = sendMessageSpy.mock.calls[0][0];
      expect(sentMessage).not.toHaveProperty("room");
    });

    it("should not include tx_hash when not provided", async () => {
      await sdk.sendTxResult("task-100", "rejected");

      const sentMessage = sendMessageSpy.mock.calls[0][0];
      expect(sentMessage.data).not.toHaveProperty("tx_hash");
    });

    it("should not include error when not provided", async () => {
      await sdk.sendTxResult("task-100", "confirmed", "0xhash");

      const sentMessage = sendMessageSpy.mock.calls[0][0];
      expect(sentMessage.data).not.toHaveProperty("error");
    });

    it("should include both tx_hash and error when both provided", async () => {
      await sdk.sendTxResult("task-200", "failed", "0xhash", "Reverted");

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: "tx_result",
        timestamp: expect.any(String),
        data: {
          task_id: "task-200",
          status: "failed",
          tx_hash: "0xhash",
          error: "Reverted"
        }
      });
    });

    it("should throw SDKError when destroyed", async () => {
      (sdk as any).isDestroyed = true;

      await expect(sdk.sendTxResult("task-1", "confirmed", "0xhash")).rejects.toThrow(
        "SDK has been destroyed"
      );

      try {
        await sdk.sendTxResult("task-1", "confirmed", "0xhash");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.SDK_DESTROYED);
      }
    });

    it("should throw SDKError when not connected", async () => {
      (sdk as any).wsClient.isConnected = false;

      await expect(sdk.sendTxResult("task-1", "confirmed", "0xhash")).rejects.toThrow(
        "Not connected to Teneo Protocol"
      );

      try {
        await sdk.sendTxResult("task-1", "confirmed", "0xhash");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.NOT_CONNECTED);
      }
    });

    it("should not call sendMessage when destroyed", async () => {
      (sdk as any).isDestroyed = true;

      try {
        await sdk.sendTxResult("task-1", "confirmed");
      } catch {
        // Expected
      }

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it("should not call sendMessage when not connected", async () => {
      (sdk as any).wsClient.isConnected = false;

      try {
        await sdk.sendTxResult("task-1", "failed", undefined, "err");
      } catch {
        // Expected
      }

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });
});
