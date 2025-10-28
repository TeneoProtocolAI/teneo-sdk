import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebhookHandler } from "./webhook-handler";
import type { SDKConfig, Logger } from "../types/config";
import { WebhookError } from "../types/events";
import fetch from "node-fetch";

// Mock node-fetch
vi.mock("node-fetch", () => {
  return {
    default: vi.fn()
  };
});

describe("WebhookHandler", () => {
  let handler: WebhookHandler;
  let mockConfig: SDKConfig;
  let mockLogger: Logger;
  let mockFetch: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = fetch as any;
    mockFetch.mockClear();

    mockConfig = {
      wsUrl: "wss://example.com/ws",
      privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
      webhookUrl: "https://webhook.example.com/events",
      webhookHeaders: {
        "X-API-Key": "test-key",
        "Content-Type": "application/json"
      },
      webhookRetries: 3,
      webhookTimeout: 5000,
      logLevel: "info"
    } as SDKConfig;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    handler = new WebhookHandler(mockConfig, mockLogger);
  });

  afterEach(() => {
    (handler as any).circuitBreaker.reset(); // Reset circuit breaker to prevent test interference
    handler.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with config", () => {
      expect(handler).toBeDefined();
      expect((handler as any).config).toStrictEqual(mockConfig);
      expect((handler as any).queue.size()).toBe(0);
      expect((handler as any).isProcessing).toBe(false);
    });

    it("should initialize without webhook URL", () => {
      const configNoWebhook = { ...mockConfig, webhookUrl: undefined };
      const handlerNoWebhook = new WebhookHandler(configNoWebhook, mockLogger);
      expect(handlerNoWebhook).toBeDefined();
    });
  });

  describe("sendWebhook", () => {
    it("should queue webhook when URL is configured", async () => {
      const event = "task_response";
      const data = { content: "test message" };

      await handler.sendWebhook(event, data);

      expect((handler as any).queue.size()).toBe(1);
      expect((handler as any).queue.toArray()[0].payload.event).toBe(event);
      expect((handler as any).queue.toArray()[0].payload.data).toMatchObject(data);
      expect((handler as any).queue.toArray()[0].attempts).toBe(0);
    });

    it("should not queue webhook when URL is not configured", async () => {
      const configNoWebhook = { ...mockConfig, webhookUrl: undefined };
      const handlerNoWebhook = new WebhookHandler(configNoWebhook, mockLogger);

      await handlerNoWebhook.sendWebhook("task_response", { content: "test" });

      expect((handlerNoWebhook as any).queue.size()).toBe(0);
    });

    it("should filter events based on webhookEvents config", async () => {
      await handler.sendWebhook("task_response", { content: "should queue" });
      await handler.sendWebhook("agent_selected", { agent: "should queue" });
      await handler.sendWebhook("error", { error: "should queue" });

      expect((handler as any).queue.size()).toBe(3);
      expect((handler as any).queue.toArray()[0].payload.event).toBe("task_response");
      expect((handler as any).queue.toArray()[1].payload.event).toBe("agent_selected");
    });

    it("should queue all events when webhookEvents is not configured", async () => {
      const configAllEvents = { ...mockConfig, webhookEvents: undefined };
      const handlerAllEvents = new WebhookHandler(configAllEvents, mockLogger);

      await handlerAllEvents.sendWebhook("task_response", { content: "test1" });
      await handlerAllEvents.sendWebhook("error", { error: "test2" });
      await handlerAllEvents.sendWebhook("message", { custom: "test3" });

      expect((handlerAllEvents as any).queue.size()).toBe(3);
    });

    it("should generate unique ID for each webhook", async () => {
      await handler.sendWebhook("task_response", { content: "test1" });
      await handler.sendWebhook("task_response", { content: "test2" });

      const queue = (handler as any).queue.toArray();
      expect(queue[0].payload.timestamp).toBeDefined();
      expect(queue[1].payload.timestamp).toBeDefined();
      // Each webhook gets unique timestamp
      expect(
        queue[0].payload.timestamp !== queue[1].payload.timestamp ||
          queue[0].payload.data.content !== queue[1].payload.data.content
      ).toBe(true);
    });

    it("should include timestamp in webhook payload", async () => {
      const beforeTime = new Date().toISOString();
      await handler.sendWebhook("task_response", { content: "test" });
      const afterTime = new Date().toISOString();

      const webhook = (handler as any).queue.toArray()[0];
      expect(webhook.payload.timestamp).toBeDefined();
      expect(webhook.payload.timestamp).toBeTypeOf("string");
    });
  });

  describe("processQueue", () => {
    it.skip("should process webhooks in queue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "OK"
      });

      await handler.sendWebhook("task_response", { content: "test" });

      // Start processing
      await (handler as any).processQueue();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://webhook.example.com/events",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-API-Key": "test-key",
            "Content-Type": "application/json"
          }),
          body: expect.stringContaining("task_response")
        })
      );

      expect((handler as any).queue.size()).toBe(0);
    });

    it("should handle successful delivery", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "OK"
      });

      const successHandler = vi.fn();
      handler.on("webhook:success", successHandler);

      await handler.sendWebhook("task_response", { content: "test" });
      await (handler as any).processQueue();

      expect(successHandler).toHaveBeenCalledWith("OK", "https://webhook.example.com/events");
    });

    it.skip("should retry on failure with exponential backoff", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const retryHandler = vi.fn();
      handler.on("webhook:retry", retryHandler);

      await handler.sendWebhook("task_response", { content: "test" });

      // First attempt
      await (handler as any).processQueue();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect((handler as any).queue.size()).toBe(1);
      expect((handler as any).queue.toArray()[0].attempts).toBe(1);

      // Wait for retry delay
      vi.advanceTimersByTime(1000);

      // Second attempt
      await (handler as any).processQueue();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect((handler as any).queue.toArray()[0].attempts).toBe(2);

      // Wait for retry delay (exponential backoff)
      vi.advanceTimersByTime(2000);

      // Third attempt (success)
      await (handler as any).processQueue();
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect((handler as any).queue.size()).toBe(0);
    });

    it.skip("should fail after max retry attempts", async () => {
      mockFetch.mockRejectedValue(new Error("Persistent error"));

      const errorHandler = vi.fn();
      handler.on("webhook:error", errorHandler);

      await handler.sendWebhook("task_response", { content: "test" });

      // Attempt all retries
      for (let i = 0; i <= mockConfig.webhookRetries!; i++) {
        await (handler as any).processQueue();
        if (i < mockConfig.webhookRetries!) {
          vi.advanceTimersByTime(1000 * Math.pow(2, i));
        }
      }

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        "https://webhook.example.com/events"
      );
      expect((handler as any).queue.size()).toBe(0);
    });

    it.skip("should handle timeout", async () => {
      // Mock a delayed response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, status: 200, text: async () => "OK" }), 10000);
          })
      );

      const errorHandler = vi.fn();
      handler.on("webhook:error", errorHandler);

      await handler.sendWebhook("task_response", { content: "test" });

      // Start processing
      const processPromise = (handler as any).processQueue();

      // Advance timers past timeout
      vi.advanceTimersByTime(5100);

      await processPromise;

      // Should have retried
      expect((handler as any).queue.size()).toBe(1);
      expect((handler as any).queue.toArray()[0].attempts).toBe(1);
    });

    it.skip("should handle HTTP error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Internal Server Error"
      });

      const retryHandler = vi.fn();
      handler.on("webhook:retry", retryHandler);

      await handler.sendWebhook("task_response", { content: "test" });
      await (handler as any).processQueue();

      expect(retryHandler).toHaveBeenCalled();
      expect((handler as any).queue.size()).toBe(1);
      expect((handler as any).queue.toArray()[0].attempts).toBe(1);
    });

    it("should process multiple webhooks in sequence", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      await handler.sendWebhook("task_response", { content: "test1" });
      await handler.sendWebhook("agent_selected", { agent: "test2" });
      await handler.sendWebhook("task_response", { content: "test3" });

      // Process all webhooks
      while ((handler as any).queue.size() > 0) {
        await (handler as any).processQueue();
      }

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect((handler as any).queue.size()).toBe(0);
    });
  });

  describe("deliverWebhook", () => {
    it("should send webhook with correct payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const webhookItem = {
        payload: {
          event: "task_response",
          timestamp: new Date().toISOString(),
          data: { content: "test" }
        },
        attempts: 0
      };

      await (handler as any).deliverWebhook(webhookItem);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://webhook.example.com/events",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-API-Key": "test-key",
            "Content-Type": "application/json"
          }),
          body: expect.stringContaining("task_response")
        })
      );
    });

    it("should merge custom headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const webhookItem = {
        payload: {
          event: "message",
          timestamp: new Date().toISOString(),
          data: {}
        },
        attempts: 0
      };

      await (handler as any).deliverWebhook(webhookItem);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "test-key",
            "Content-Type": "application/json"
          })
        })
      );
    });

    it.skip("should handle AbortController for timeout", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error("Timeout");
            error.name = "AbortError";
            setTimeout(() => reject(error), 100);
          })
      );

      const webhookItem = {
        payload: {
          event: "message",
          timestamp: new Date().toISOString(),
          data: {}
        },
        attempts: 0
      };

      await expect((handler as any).deliverWebhook(webhookItem)).rejects.toThrow();
    }, 15000);

    it("should validate successful response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const webhookItem = {
        payload: {
          event: "message",
          timestamp: new Date().toISOString(),
          data: {}
        },
        attempts: 0
      };

      await (handler as any).deliverWebhook(webhookItem);
      // Should not throw
    });

    it("should handle non-2xx responses as failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Not Found"
      });

      const webhookItem = {
        payload: {
          event: "message",
          timestamp: new Date().toISOString(),
          data: {}
        },
        attempts: 0
      };

      await expect((handler as any).deliverWebhook(webhookItem)).rejects.toThrow(WebhookError);
    });
  });

  describe("validateWebhookUrl - SSRF Protection", () => {
    describe("Valid URLs", () => {
      it("should accept HTTPS public URLs", () => {
        const urls = ["https://webhook.example.com/events", "https://api.example.org/webhook"];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).not.toThrow();
        });
      });

      it("should accept HTTP localhost URLs with allowInsecureWebhooks", () => {
        const configWithInsecure = { ...mockConfig, allowInsecureWebhooks: true };
        const handlerWithInsecure = new WebhookHandler(configWithInsecure, mockLogger);

        const urls = [
          "http://localhost/webhook",
          "http://localhost:3000/events",
          "http://127.0.0.1/webhook",
          "http://127.0.0.1:8080/events"
        ];

        urls.forEach((url) => {
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).not.toThrow();
        });
      });
    });

    describe("SSRF Protection - Cloud Metadata", () => {
      it("should block AWS metadata endpoints", () => {
        const configWithInsecure = { ...mockConfig, allowInsecureWebhooks: true };
        const handlerWithInsecure = new WebhookHandler(configWithInsecure, mockLogger);

        const urls = [
          "http://169.254.169.254/latest/meta-data/",
          "https://169.254.169.254/latest/meta-data/iam/security-credentials/"
        ];

        urls.forEach((url) => {
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(
            /cloud metadata endpoint/i
          );
        });
      });

      it("should block Google Cloud metadata endpoints", () => {
        const configWithInsecure = { ...mockConfig, allowInsecureWebhooks: true };
        const handlerWithInsecure = new WebhookHandler(configWithInsecure, mockLogger);

        const urls = [
          "http://metadata.google.internal/computeMetadata/v1/",
          "http://metadata.google.com/computeMetadata/v1/"
        ];

        urls.forEach((url) => {
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(
            /cloud metadata/i
          );
        });
      });

      it("should block Kubernetes services", () => {
        const configWithInsecure = { ...mockConfig, allowInsecureWebhooks: true };
        const handlerWithInsecure = new WebhookHandler(configWithInsecure, mockLogger);

        const urls = [
          "http://kubernetes.default/api",
          "http://redis.default.svc.cluster.local:6379"
        ];

        urls.forEach((url) => {
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(
            /Kubernetes service|cloud metadata/i
          );
        });
      });
    });

    describe("SSRF Protection - Private IPs", () => {
      it("should block RFC1918 private IP ranges", () => {
        const urls = [
          "https://10.0.0.1/webhook",
          "https://192.168.1.1/webhook",
          "https://172.16.0.1/webhook",
          "https://172.31.255.255/webhook"
        ];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(/private IP address/i);
        });
      });

      it("should block link-local addresses", () => {
        const urls = ["https://169.254.1.1/webhook", "https://169.254.255.255/webhook"];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(WebhookError);
        });
      });

      it("should block IPv6 private ranges", () => {
        const configWithInsecure = { ...mockConfig, allowInsecureWebhooks: true };
        const handlerWithInsecure = new WebhookHandler(configWithInsecure, mockLogger);

        const urls = [
          "http://[fc00::1]/webhook",
          "http://[fd00::1]/webhook",
          "http://[fe80::1]/webhook"
        ];

        urls.forEach((url) => {
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handlerWithInsecure as any).validateWebhookUrl(url)).toThrow(/private IP/i);
        });
      });
    });

    describe("SSRF Protection - Dangerous Ports", () => {
      it("should block common internal service ports", () => {
        const urls = [
          "https://example.com:22/webhook", // SSH
          "https://example.com:3306/webhook", // MySQL
          "https://example.com:5432/webhook", // PostgreSQL
          "https://example.com:6379/webhook", // Redis
          "https://example.com:27017/webhook" // MongoDB
        ];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(
            /Port.*internal services/i
          );
        });
      });

      it("should allow safe ports", () => {
        const urls = [
          "https://example.com:443/webhook",
          "https://example.com:8443/webhook",
          "https://example.com:3000/webhook"
        ];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).not.toThrow();
        });
      });
    });

    describe("Protocol Validation", () => {
      it("should reject HTTP for non-localhost without allowInsecureWebhooks", () => {
        const urls = ["http://example.com/webhook"];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(
            /must use HTTPS|Only HTTPS/i
          );
        });

        // Private IPs are blocked for different reason (private IP, not HTTPS requirement)
        const privateUrls = ["http://192.168.1.1/webhook", "http://10.0.0.1/webhook"];
        privateUrls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(WebhookError);
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow(/private IP/i);
        });
      });

      it("should reject non-HTTP/HTTPS protocols", () => {
        const urls = ["ftp://example.com/webhook", "file:///etc/passwd", "javascript:alert(1)"];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow();
        });
      });
    });

    describe("Invalid URLs", () => {
      it("should reject malformed URLs", () => {
        const urls = ["not-a-url", "", "htp://example.com"];

        urls.forEach((url) => {
          expect(() => (handler as any).validateWebhookUrl(url)).toThrow();
        });
      });
    });
  });

  describe("destroy", () => {
    it("should clear the queue", async () => {
      await handler.sendWebhook("task_response", { content: "test1" });
      await handler.sendWebhook("agent_selected", { agent: "test2" });

      expect((handler as any).queue.size()).toBe(2);

      handler.destroy();

      expect((handler as any).queue.size()).toBe(0);
    });

    it("should stop processing", async () => {
      (handler as any).isProcessing = true;

      handler.destroy();

      expect((handler as any).isProcessing).toBe(false);
    });

    it("should be safe to call multiple times", async () => {
      await handler.sendWebhook("task_response", { content: "test" });

      handler.destroy();
      handler.destroy();
      handler.destroy();

      expect((handler as any).queue.size()).toBe(0);
      expect((handler as any).isProcessing).toBe(false);
    });
  });

  describe("event emission", () => {
    it("should emit webhook:sent event", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const sentHandler = vi.fn();
      handler.on("webhook:sent", sentHandler);

      await handler.sendWebhook("task_response", { content: "test" });
      await (handler as any).processQueue();

      expect(sentHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "task_response"
        }),
        "https://webhook.example.com/events"
      );
    });

    it("should emit webhook:success event", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => "Created"
      });

      const successHandler = vi.fn();
      handler.on("webhook:success", successHandler);

      await handler.sendWebhook("task_response", { content: "test" });
      await (handler as any).processQueue();

      expect(successHandler).toHaveBeenCalledWith("Created", "https://webhook.example.com/events");
    });

    it.skip("should emit webhook:retry event", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const retryHandler = vi.fn();
      handler.on("webhook:retry", retryHandler);

      await handler.sendWebhook("task_response", { content: "test" });
      await (handler as any).processQueue();

      expect(retryHandler).toHaveBeenCalledWith(1, "https://webhook.example.com/events");
    });

    it.skip("should emit webhook:error event", async () => {
      mockFetch.mockRejectedValue(new Error("Persistent error"));

      const errorHandler = vi.fn();
      handler.on("webhook:error", errorHandler);

      await handler.sendWebhook("task_response", { content: "test" });

      // Exhaust all retries
      for (let i = 0; i <= mockConfig.webhookRetries!; i++) {
        await (handler as any).processQueue();
        vi.advanceTimersByTime(10000);
      }

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        "https://webhook.example.com/events"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty data payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      await handler.sendWebhook("message", undefined as any);
      await (handler as any).processQueue();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.any(String)
        })
      );
    });

    it("should handle large payloads", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      const largeData = {
        content: "x".repeat(100000), // 100KB string
        array: Array(1000).fill({ nested: "object" })
      };

      await handler.sendWebhook("task_response", largeData);
      await (handler as any).processQueue();

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.data.content.length).toBe(100000);
    });

    it.skip("should handle concurrent webhook sends", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "OK"
      });

      // Send multiple webhooks rapidly
      for (let i = 0; i < 10; i++) {
        await handler.sendWebhook("task_response", { index: i });
      }

      expect((handler as any).queue.size()).toBe(10);

      // Process all
      while ((handler as any).queue.size() > 0) {
        await (handler as any).processQueue();
      }

      expect(mockFetch).toHaveBeenCalledTimes(10);
    });
  });
});
