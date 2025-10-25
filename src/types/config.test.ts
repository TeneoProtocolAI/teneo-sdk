import { describe, it, expect, vi } from "vitest";
import {
  SDKConfigSchema,
  SDKConfigBuilder,
  validateConfig,
  DEFAULT_CONFIG,
  LogLevel
} from "./config";

describe("SDK Configuration", () => {
  describe("SDKConfigSchema", () => {
    it("should validate a minimal config", () => {
      const config = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
      };
      const result = SDKConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate a full config with all options", () => {
      const config = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        webhookUrl: "https://webhook.example.com/events",
        webhookHeaders: { "X-API-Key": "secret" },
        reconnect: true,
        reconnectDelay: 2000,
        maxReconnectAttempts: 10,
        connectionTimeout: 30000,
        messageTimeout: 15000,
        maxMessageSize: 2 * 1024 * 1024,
        logLevel: "debug" as LogLevel,
        autoJoinRooms: ["room1", "room2"],
        responseFormat: "humanized" as const,
        includeMetadata: true,
        webhookRetries: 5,
        webhookTimeout: 10000,
        logger: console,
        enableCache: true,
        cacheTimeout: 300000,
        maxCacheSize: 100,
        validateSignatures: true,
        allowInsecureWebhooks: false
      };
      const result = SDKConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject invalid websocket URLs", () => {
      const invalidConfigs = [
        {
          wsUrl: "http://example.com/ws", // HTTP not allowed
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
        },
        {
          wsUrl: "not-a-url",
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
        },
        {
          wsUrl: "",
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
        }
      ];

      invalidConfigs.forEach((config) => {
        const result = SDKConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      });
    });

    it("should accept any string as private key", () => {
      const validConfigs = [
        {
          wsUrl: "wss://example.com/ws",
          privateKey: "invalid-key" // Schema doesn't validate format
        },
        {
          wsUrl: "wss://example.com/ws",
          privateKey: "0x123" // Too short but valid as string
        },
        {
          wsUrl: "wss://example.com/ws",
          privateKey: "" // Empty string is valid
        }
      ];

      validConfigs.forEach((config) => {
        const result = SDKConfigSchema.safeParse(config);
        expect(result.success).toBe(true); // Schema accepts any string
      });
    });

    it("should validate webhook URL security", () => {
      const validWebhookUrls = [
        "https://webhook.example.com/events",
        "http://localhost:3000/webhook",
        "http://127.0.0.1:8080/webhook"
      ];

      validWebhookUrls.forEach((url) => {
        const config = {
          wsUrl: "wss://example.com/ws",
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
          webhookUrl: url,
          allowInsecureWebhooks: url.startsWith("http://localhost") || url.startsWith("http://127")
        };
        const result = SDKConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });

      // HTTP non-localhost should pass with validation (validation is done in validateConfig, not the schema)
      const invalidWebhookUrl = "http://example.com/webhook";
      const config = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        webhookUrl: invalidWebhookUrl,
        allowInsecureWebhooks: false
      };
      const result = SDKConfigSchema.safeParse(config);
      expect(result.success).toBe(true); // Schema allows it, custom validation rejects it
    });

    it("should validate log levels", () => {
      const validLevels: LogLevel[] = ["debug", "info", "warn", "error", "silent"];

      validLevels.forEach((level) => {
        const config = {
          wsUrl: "wss://example.com/ws",
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
          logLevel: level
        };
        const result = SDKConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });

      const invalidConfig = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        logLevel: "verbose" // Invalid
      };
      const result = SDKConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("should validate response format", () => {
      const validFormats = ["raw", "humanized", "both"];

      validFormats.forEach((format) => {
        const config = {
          wsUrl: "wss://example.com/ws",
          privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
          responseFormat: format
        };
        const result = SDKConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("SDKConfigBuilder", () => {
    it("should build config with chained methods", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withAuthentication("0x1234567890123456789012345678901234567890123456789012345678901234")
        .withWebhook("https://webhook.example.com/events", {
          "X-API-Key": "secret"
        })
        .withReconnection(true, 3000, 15)
        .withLogging("debug")
        .withAutoJoinRooms(["room1", "room2"])
        .withResponseFormat("humanized", true)
        .withCache(true, 300000, 100)
        .build();

      expect(config.wsUrl).toBe("wss://example.com/ws");
      expect(config.privateKey).toBe(
        "0x1234567890123456789012345678901234567890123456789012345678901234"
      );
      expect(config.webhookUrl).toBe("https://webhook.example.com/events");
      expect(config.webhookHeaders).toEqual({ "X-API-Key": "secret" });
      expect(config.reconnect).toBe(true);
      expect(config.reconnectDelay).toBe(3000);
      expect(config.maxReconnectAttempts).toBe(15);
      expect(config.logLevel).toBe("debug");
      expect(config.autoJoinRooms).toEqual(["room1", "room2"]);
      expect(config.responseFormat).toBe("humanized");
      expect(config.includeMetadata).toBe(true);
      expect(config.enableCache).toBe(true);
      expect(config.cacheTimeout).toBe(300000);
      expect(config.maxCacheSize).toBe(100);
    });

    it("should build successfully with default wsUrl", () => {
      // Builder starts with DEFAULT_CONFIG which includes wsUrl
      expect(() => {
        new SDKConfigBuilder().build();
      }).not.toThrow();

      expect(() => {
        new SDKConfigBuilder().withWebSocketUrl("wss://example.com/ws").build();
      }).not.toThrow();

      expect(() => {
        new SDKConfigBuilder()
          .withAuthentication("0x1234567890123456789012345678901234567890123456789012345678901234")
          .build();
      }).not.toThrow(); // Private key is not actually required if wsUrl is set in default
    });

    it("should merge with default config", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withAuthentication("0x1234567890123456789012345678901234567890123456789012345678901234")
        .build();

      // Should have default values
      expect(config.reconnect).toBe(DEFAULT_CONFIG.reconnect);
      expect(config.reconnectDelay).toBe(DEFAULT_CONFIG.reconnectDelay);
      expect(config.maxReconnectAttempts).toBe(DEFAULT_CONFIG.maxReconnectAttempts);
      expect(config.logLevel).toBe(DEFAULT_CONFIG.logLevel);
      expect(config.responseFormat).toBe(DEFAULT_CONFIG.responseFormat);
    });

    it("should handle webhook configuration", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withAuthentication("0x1234567890123456789012345678901234567890123456789012345678901234")
        .withWebhook("https://webhook.example.com", { "X-API-Key": "secret" })
        .build();

      expect(config.webhookUrl).toBe("https://webhook.example.com");
      expect(config.webhookHeaders).toEqual({ "X-API-Key": "secret" });
    });

    it("should handle custom logger", () => {
      const customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withAuthentication("0x1234567890123456789012345678901234567890123456789012345678901234")
        .withLogging("debug", customLogger)
        .build();

      expect(config.logger).toBeDefined();
      expect(config.logger?.debug).toBeDefined();
      expect(config.logger?.info).toBeDefined();
      expect(config.logger?.warn).toBeDefined();
      expect(config.logger?.error).toBeDefined();
    });
  });

  describe("validateConfig", () => {
    it("should validate and return valid config", () => {
      const config = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
      };
      const validated = validateConfig(config);
      expect(validated).toMatchObject(config);
    });

    it("should throw on invalid config", () => {
      const invalidConfig = {
        wsUrl: "http://example.com/ws", // Invalid protocol
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
      };
      expect(() => validateConfig(invalidConfig)).toThrow();
    });

    it("should validate webhook URL security rules", () => {
      // HTTPS should always be valid
      const httpsConfig = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        webhookUrl: "https://webhook.example.com/events"
      };
      expect(() => validateConfig(httpsConfig)).not.toThrow();

      // HTTP localhost should be valid
      const localhostConfig = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        webhookUrl: "http://localhost:3000/webhook",
        allowInsecureWebhooks: true
      };
      expect(() => validateConfig(localhostConfig)).not.toThrow();

      // HTTP non-localhost should be invalid without allowInsecureWebhooks
      const httpConfig = {
        wsUrl: "wss://example.com/ws",
        privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
        webhookUrl: "http://example.com/webhook",
        allowInsecureWebhooks: false
      };
      expect(() => validateConfig(httpConfig)).toThrow();
    });
  });

  describe("DEFAULT_CONFIG", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_CONFIG.reconnect).toBe(true);
      expect(DEFAULT_CONFIG.reconnectDelay).toBe(5000);
      expect(DEFAULT_CONFIG.maxReconnectAttempts).toBe(10);
      expect(DEFAULT_CONFIG.connectionTimeout).toBe(30000);
      expect(DEFAULT_CONFIG.messageTimeout).toBe(30000);
      expect(DEFAULT_CONFIG.maxMessageSize).toBe(2 * 1024 * 1024);
      expect(DEFAULT_CONFIG.logLevel).toBe("info");
      expect(DEFAULT_CONFIG.responseFormat).toBe("humanized");
      expect(DEFAULT_CONFIG.includeMetadata).toBe(false);
      expect(DEFAULT_CONFIG.enableCache).toBe(true);
      expect(DEFAULT_CONFIG.cacheTimeout).toBe(300000);
      expect(DEFAULT_CONFIG.maxCacheSize).toBe(100);
      expect(DEFAULT_CONFIG.validateSignatures).toBe(false);
      expect(DEFAULT_CONFIG.allowInsecureWebhooks).toBe(false);
      expect(DEFAULT_CONFIG.webhookRetries).toBe(3);
      expect(DEFAULT_CONFIG.webhookTimeout).toBe(10000);
    });
  });
});
