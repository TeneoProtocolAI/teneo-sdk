import { describe, it, expect } from "vitest";
import {
  SDKError,
  ConnectionError,
  AuthenticationError,
  MessageError,
  WebhookError,
  ConfigurationError,
  TimeoutError,
  isRecoverableError
} from "./events";

describe("Error Classes", () => {
  describe("SDKError", () => {
    it("should create base SDK error", () => {
      const error = new SDKError("Test error", "TEST_ERROR");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SDKError);
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.name).toBe("SDKError");
      expect(error.recoverable).toBe(false);
    });

    it("should include details in error", () => {
      const details = { field: "value", count: 42 };
      const error = new SDKError("Test error", "TEST_ERROR", details);
      expect(error.details).toEqual(details);
    });

    it("should serialize to JSON", () => {
      const error = new SDKError("Test error", "TEST_ERROR", { key: "value" });
      const json = error.toJSON();

      expect(json).toEqual({
        name: "SDKError",
        message: "Test error",
        code: "TEST_ERROR",
        recoverable: false,
        details: { key: "value" }
      });
    });

    it("should have stack trace", () => {
      const error = new SDKError("Test error", "TEST_ERROR");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("SDKError");
    });
  });

  describe("ConnectionError", () => {
    it("should create connection error", () => {
      const error = new ConnectionError("Connection failed");
      expect(error).toBeInstanceOf(ConnectionError);
      expect(error).toBeInstanceOf(SDKError);
      expect(error.name).toBe("ConnectionError");
      expect(error.code).toBe("CONNECTION_ERROR");
      expect(error.recoverable).toBe(true); // Connection errors are recoverable
    });

    it("should be recoverable by default", () => {
      const error = new ConnectionError("Connection lost");
      expect(error.recoverable).toBe(true);
      expect(isRecoverableError(error)).toBe(true);
    });

    it("should include connection details", () => {
      const error = new ConnectionError("Connection failed", {
        url: "wss://example.com",
        attempt: 3
      });
      expect(error.details).toEqual({
        url: "wss://example.com",
        attempt: 3
      });
    });
  });

  describe("AuthenticationError", () => {
    it("should create authentication error", () => {
      const error = new AuthenticationError("Invalid credentials");
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.name).toBe("AuthenticationError");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.recoverable).toBe(false); // Auth errors are not recoverable
    });

    it("should not be recoverable", () => {
      const error = new AuthenticationError("Invalid token");
      expect(error.recoverable).toBe(false);
      expect(isRecoverableError(error)).toBe(false);
    });

    it("should include auth details", () => {
      const error = new AuthenticationError("Auth failed", {
        walletAddress: "0x123",
        reason: "Invalid signature"
      });
      expect(error.details?.walletAddress).toBe("0x123");
      expect(error.details?.reason).toBe("Invalid signature");
    });
  });

  describe("MessageError", () => {
    it("should create message error", () => {
      const error = new MessageError("Invalid message format");
      expect(error).toBeInstanceOf(MessageError);
      expect(error.name).toBe("MessageError");
      expect(error.code).toBe("MESSAGE_ERROR");
      expect(error.recoverable).toBe(false);
    });

    it("should include message details", () => {
      const error = new MessageError("Parse failed", {
        messageType: "agent_response",
        validationErrors: ["Missing field: content"]
      });
      expect(error.details?.messageType).toBe("agent_response");
      expect(error.details?.validationErrors).toContain("Missing field: content");
    });
  });

  describe("WebhookError", () => {
    it("should create webhook error", () => {
      const error = new WebhookError("Webhook delivery failed");
      expect(error).toBeInstanceOf(WebhookError);
      expect(error.name).toBe("WebhookError");
      expect(error.code).toBe("WEBHOOK_ERROR");
      expect(error.recoverable).toBe(true); // Webhook errors are recoverable
    });

    it("should be recoverable", () => {
      const error = new WebhookError("Network error");
      expect(error.recoverable).toBe(true);
      expect(isRecoverableError(error)).toBe(true);
    });

    it("should include webhook details", () => {
      const error = new WebhookError("Delivery failed", {
        url: "https://webhook.example.com",
        statusCode: 500,
        attempt: 2
      });
      expect(error.details?.url).toBe("https://webhook.example.com");
      expect(error.details?.statusCode).toBe(500);
      expect(error.details?.attempt).toBe(2);
    });
  });

  describe("ConfigurationError", () => {
    it("should create configuration error", () => {
      const error = new ConfigurationError("Invalid configuration");
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.name).toBe("ConfigurationError");
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error.recoverable).toBe(false);
    });

    it("should not be recoverable", () => {
      const error = new ConfigurationError("Missing required field");
      expect(error.recoverable).toBe(false);
      expect(isRecoverableError(error)).toBe(false);
    });

    it("should include config details", () => {
      const error = new ConfigurationError("Invalid config", {
        field: "websocketUrl",
        value: "http://invalid",
        reason: "Must use wss:// protocol"
      });
      expect(error.details?.field).toBe("websocketUrl");
      expect(error.details?.reason).toBe("Must use wss:// protocol");
    });
  });

  describe("TimeoutError", () => {
    it("should create timeout error", () => {
      const error = new TimeoutError("Request timed out");
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe("TimeoutError");
      expect(error.code).toBe("TIMEOUT_ERROR");
      expect(error.recoverable).toBe(true); // Timeout errors are recoverable
    });

    it("should be recoverable", () => {
      const error = new TimeoutError("Operation timed out");
      expect(error.recoverable).toBe(true);
      expect(isRecoverableError(error)).toBe(true);
    });

    it("should include timeout details", () => {
      const error = new TimeoutError("Request timeout", {
        operation: "auth_request",
        timeout: 5000,
        elapsed: 5100
      });
      expect(error.details?.operation).toBe("auth_request");
      expect(error.details?.timeout).toBe(5000);
      expect(error.details?.elapsed).toBe(5100);
    });
  });

  describe("isRecoverableError", () => {
    it("should identify recoverable errors", () => {
      const recoverableErrors = [
        new ConnectionError("Connection lost"),
        new WebhookError("Delivery failed"),
        new TimeoutError("Request timeout")
      ];

      recoverableErrors.forEach((error) => {
        expect(isRecoverableError(error)).toBe(true);
      });
    });

    it("should identify non-recoverable errors", () => {
      const nonRecoverableErrors = [
        new AuthenticationError("Invalid credentials"),
        new MessageError("Invalid format"),
        new ConfigurationError("Invalid config"),
        new SDKError("Generic error", "GENERIC")
      ];

      nonRecoverableErrors.forEach((error) => {
        expect(isRecoverableError(error)).toBe(false);
      });
    });

    it("should handle non-SDKError instances", () => {
      const regularError = new Error("Regular error");
      expect(isRecoverableError(regularError)).toBe(false);

      const customError = { message: "Not an error object" };
      expect(isRecoverableError(customError as any)).toBe(false);
    });
  });

  describe("Error Inheritance", () => {
    it("should maintain proper prototype chain", () => {
      const connectionError = new ConnectionError("Test");
      expect(connectionError).toBeInstanceOf(Error);
      expect(connectionError).toBeInstanceOf(SDKError);
      expect(connectionError).toBeInstanceOf(ConnectionError);

      const authError = new AuthenticationError("Test");
      expect(authError).toBeInstanceOf(Error);
      expect(authError).toBeInstanceOf(SDKError);
      expect(authError).toBeInstanceOf(AuthenticationError);
    });

    it("should have correct constructor name", () => {
      const errors = [
        new SDKError("Test", "TEST"),
        new ConnectionError("Test"),
        new AuthenticationError("Test"),
        new MessageError("Test"),
        new WebhookError("Test"),
        new ConfigurationError("Test"),
        new TimeoutError("Test")
      ];

      expect(errors[0].constructor.name).toBe("SDKError");
      expect(errors[1].constructor.name).toBe("ConnectionError");
      expect(errors[2].constructor.name).toBe("AuthenticationError");
      expect(errors[3].constructor.name).toBe("MessageError");
      expect(errors[4].constructor.name).toBe("WebhookError");
      expect(errors[5].constructor.name).toBe("ConfigurationError");
      expect(errors[6].constructor.name).toBe("TimeoutError");
    });
  });

  describe("Error Serialization", () => {
    it("should serialize all error types to JSON", () => {
      const errors = [
        new ConnectionError("Connection failed", { url: "wss://example.com" }),
        new AuthenticationError("Auth failed", { wallet: "0x123" }),
        new MessageError("Parse failed", { type: "unknown" }),
        new WebhookError("Delivery failed", { status: 500 }),
        new ConfigurationError("Invalid config", { field: "url" }),
        new TimeoutError("Timeout", { ms: 5000 })
      ];

      errors.forEach((error) => {
        const json = error.toJSON();
        expect(json).toHaveProperty("name");
        expect(json).toHaveProperty("message");
        expect(json).toHaveProperty("code");
        expect(json).toHaveProperty("recoverable");
        expect(json).toHaveProperty("details");

        // Ensure JSON is serializable
        const stringified = JSON.stringify(json);
        expect(stringified).toBeDefined();

        // Can parse back
        const parsed = JSON.parse(stringified);
        expect(parsed.message).toBe(error.message);
        expect(parsed.code).toBe(error.code);
      });
    });
  });
});
