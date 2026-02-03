/**
 * Unit tests for TriggerWalletTxHandler
 * Tests handling of trigger_wallet_tx messages from the server
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TriggerWalletTxHandler } from "../../../src/handlers/message-handlers/trigger-wallet-tx-handler";
import { HandlerContext } from "../../../src/handlers/message-handlers/types";
import { Logger } from "../../../src/types";

describe("TriggerWalletTxHandler", () => {
  let handler: TriggerWalletTxHandler;
  let mockContext: HandlerContext;
  let mockLogger: Logger;
  let emitSpy: ReturnType<typeof vi.fn>;
  let sendWebhookSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Create spies
    emitSpy = vi.fn();
    sendWebhookSpy = vi.fn().mockResolvedValue(undefined);

    // Create mock context
    mockContext = {
      emit: emitSpy,
      sendWebhook: sendWebhookSpy,
      logger: mockLogger,
      getConnectionState: vi.fn(),
      getAuthState: vi.fn(),
      updateConnectionState: vi.fn(),
      updateAuthState: vi.fn(),
      sendMessage: vi.fn()
    };

    // Create handler instance
    handler = new TriggerWalletTxHandler();
  });

  describe("Handler Metadata", () => {
    it("should have correct type", () => {
      expect(handler.type).toBe("trigger_wallet_tx");
    });

    it("should have schema defined", () => {
      expect(handler.schema).toBeDefined();
    });

    it("should identify messages it can handle", () => {
      const message = { type: "trigger_wallet_tx", data: {} };
      expect(handler.canHandle(message as any)).toBe(true);
    });

    it("should not handle other message types", () => {
      const message = { type: "other_type", data: {} };
      expect(handler.canHandle(message as any)).toBe(false);
    });
  });

  describe("Response Handling", () => {
    it("should handle full message with all fields", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "weather-agent",
        data: {
          task_id: "task-123",
          tx: {
            to: "0xRecipient",
            value: "1000000000000000000",
            data: "0xabcdef",
            chainId: 1
          },
          description: "Pay for weather data",
          optional: true
        },
        room: "room-456"
      };

      await handler.handle(message, mockContext);

      // Should emit event
      expect(emitSpy).toHaveBeenCalledWith("wallet:tx_requested", {
        taskId: "task-123",
        agentName: "weather-agent",
        tx: {
          to: "0xRecipient",
          value: "1000000000000000000",
          data: "0xabcdef",
          chainId: 1
        },
        description: "Pay for weather data",
        optional: true,
        room: "room-456"
      });

      // Should send webhook
      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "wallet_tx_requested",
        expect.objectContaining({
          taskId: "task-123",
          agentName: "weather-agent",
          tx: {
            to: "0xRecipient",
            value: "1000000000000000000",
            data: "0xabcdef",
            chainId: 1
          },
          description: "Pay for weather data",
          optional: true,
          room: "room-456"
        }),
        undefined
      );
    });

    it("should handle minimal message with only required fields", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        data: {
          task_id: "task-minimal",
          tx: {
            to: "0xTarget",
            value: "0",
            chainId: 42161
          }
        }
      };

      await handler.handle(message, mockContext);

      // Should emit event with defaults
      expect(emitSpy).toHaveBeenCalledWith("wallet:tx_requested", {
        taskId: "task-minimal",
        agentName: undefined,
        tx: {
          to: "0xTarget",
          value: "0",
          chainId: 42161
        },
        description: undefined,
        optional: false,
        room: undefined
      });
    });

    it("should handle message without optional tx.data field", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "swap-agent",
        data: {
          task_id: "task-no-data",
          tx: {
            to: "0xContract",
            value: "500000000000000000",
            chainId: 10
          },
          description: "Simple ETH transfer"
        },
        room: "room-789"
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("wallet:tx_requested", {
        taskId: "task-no-data",
        agentName: "swap-agent",
        tx: {
          to: "0xContract",
          value: "500000000000000000",
          chainId: 10
        },
        description: "Simple ETH transfer",
        optional: false,
        room: "room-789"
      });
    });
  });

  describe("Event Emission", () => {
    it("should emit wallet:tx_requested with correct shape", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "defi-agent",
        data: {
          task_id: "task-emit",
          tx: {
            to: "0xDeFiContract",
            value: "2000000000000000000",
            data: "0x1234",
            chainId: 137
          },
          description: "Swap tokens",
          optional: true
        },
        room: "room-emit"
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith("wallet:tx_requested", {
        taskId: "task-emit",
        agentName: "defi-agent",
        tx: {
          to: "0xDeFiContract",
          value: "2000000000000000000",
          data: "0x1234",
          chainId: 137
        },
        description: "Swap tokens",
        optional: true,
        room: "room-emit"
      });
    });

    it("should default optional to false when not provided", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "agent-no-optional",
        data: {
          task_id: "task-default",
          tx: {
            to: "0xAddr",
            value: "100",
            chainId: 1
          }
        }
      };

      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "wallet:tx_requested",
        expect.objectContaining({
          optional: false
        })
      );
    });
  });

  describe("Webhook", () => {
    it("should send wallet_tx_requested webhook", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "webhook-agent",
        data: {
          task_id: "task-webhook",
          tx: {
            to: "0xWebhookTarget",
            value: "0",
            chainId: 1
          },
          description: "Webhook test tx",
          optional: false
        },
        room: "room-wh"
      };

      await handler.handle(message, mockContext);

      expect(sendWebhookSpy).toHaveBeenCalledWith(
        "wallet_tx_requested",
        expect.objectContaining({
          taskId: "task-webhook",
          agentName: "webhook-agent",
          tx: {
            to: "0xWebhookTarget",
            value: "0",
            chainId: 1
          },
          description: "Webhook test tx",
          optional: false,
          room: "room-wh"
        }),
        undefined
      );
    });

    it("should handle webhook failure gracefully", async () => {
      const webhookError = new Error("Webhook failed");
      sendWebhookSpy.mockRejectedValueOnce(webhookError);

      const message = {
        type: "trigger_wallet_tx" as const,
        from: "fail-agent",
        data: {
          task_id: "task-fail",
          tx: {
            to: "0xFailTarget",
            value: "0",
            chainId: 1
          }
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      // Should still emit event
      expect(emitSpy).toHaveBeenCalledWith(
        "wallet:tx_requested",
        expect.objectContaining({
          taskId: "task-fail"
        })
      );
    });
  });

  describe("Message Validation", () => {
    it("should handle invalid message structure (missing data)", async () => {
      const invalidMessage = {
        type: "trigger_wallet_tx"
        // Missing data field
      } as any;

      await handler.handle(invalidMessage, mockContext);

      // Should log validation warning at debug level (resilience pattern)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("trigger_wallet_tx message validation warning"),
        expect.any(Object)
      );

      // Handler validates and logs specific warning message
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Invalid trigger_wallet_tx message: missing required fields",
        expect.objectContaining({
          hasData: false,
          hasTaskId: false,
          hasTx: false
        })
      );
    });

    it("should accept valid message with extra fields via passthrough", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "extra-agent",
        data: {
          task_id: "task-extra",
          tx: {
            to: "0xExtra",
            value: "0",
            chainId: 1
          },
          extra_field: "should be kept",
          another_extra: 123
        }
      };

      // Should not throw
      await handler.handle(message, mockContext);

      expect(emitSpy).toHaveBeenCalledWith(
        "wallet:tx_requested",
        expect.objectContaining({
          taskId: "task-extra",
          agentName: "extra-agent"
        })
      );
    });
  });

  describe("Debug Logging", () => {
    it("should log at debug level", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "log-agent",
        data: {
          task_id: "task-log",
          tx: {
            to: "0xLogTarget",
            value: "999",
            data: "0xdeadbeef",
            chainId: 42161
          }
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Handling trigger_wallet_tx",
        expect.objectContaining({
          from: "log-agent",
          taskId: "task-log",
          tx: {
            to: "0xLogTarget",
            value: "999",
            data: "0xdeadbeef",
            chainId: 42161
          }
        })
      );
    });

    it("should log at info level", async () => {
      const message = {
        type: "trigger_wallet_tx" as const,
        from: "info-agent",
        data: {
          task_id: "task-info",
          tx: {
            to: "0xInfoTarget",
            value: "12345",
            chainId: 8453
          }
        }
      };

      await handler.handle(message, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Wallet transaction requested",
        expect.objectContaining({
          agentName: "info-agent",
          taskId: "task-info",
          to: "0xInfoTarget",
          value: "12345",
          chainId: 8453
        })
      );
    });
  });
});
