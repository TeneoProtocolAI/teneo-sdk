/**
 * Tests for SSRF validator
 */

import { describe, it, expect } from "vitest";
import {
  isPrivateIP,
  isCloudMetadataEndpoint,
  isLocalhostException,
  validateWebhookUrl
} from "./ssrf-validator";

describe("SSRF Validator", () => {
  describe("isPrivateIP", () => {
    it("should detect RFC1918 private IPv4 ranges", () => {
      // 10.0.0.0/8
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("10.255.255.255")).toBe(true);

      // 192.168.0.0/16
      expect(isPrivateIP("192.168.0.1")).toBe(true);
      expect(isPrivateIP("192.168.255.255")).toBe(true);

      // 172.16.0.0/12 (172.16-31)
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("172.31.255.255")).toBe(true);
    });

    it("should NOT detect public IPv4 addresses as private", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("172.15.0.1")).toBe(false); // Before 172.16
      expect(isPrivateIP("172.32.0.1")).toBe(false); // After 172.31
    });

    it("should detect IPv4 loopback addresses", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("127.0.0.255")).toBe(true);
      expect(isPrivateIP("127.255.255.255")).toBe(true);
    });

    it("should detect IPv4 link-local addresses", () => {
      expect(isPrivateIP("169.254.0.0")).toBe(true);
      expect(isPrivateIP("169.254.169.254")).toBe(true);
      expect(isPrivateIP("169.254.255.255")).toBe(true);
    });

    it("should detect IPv4 multicast addresses", () => {
      expect(isPrivateIP("224.0.0.1")).toBe(true);
      expect(isPrivateIP("239.255.255.255")).toBe(true);
    });

    it("should detect IPv4 broadcast address", () => {
      expect(isPrivateIP("255.255.255.255")).toBe(true);
    });

    it("should detect IPv6 loopback", () => {
      expect(isPrivateIP("::1")).toBe(true);
      expect(isPrivateIP("[::1]")).toBe(true);
      expect(isPrivateIP("0:0:0:0:0:0:0:1")).toBe(true);
    });

    it("should detect IPv6 unspecified address", () => {
      expect(isPrivateIP("::")).toBe(true);
      expect(isPrivateIP("[::]")).toBe(true);
      expect(isPrivateIP("0:0:0:0:0:0:0:0")).toBe(true);
    });

    it("should detect IPv6 link-local addresses", () => {
      expect(isPrivateIP("fe80::1")).toBe(true);
      expect(isPrivateIP("fe80:0000:0000:0000:0000:0000:0000:0001")).toBe(true);
      expect(isPrivateIP("feb0::1")).toBe(true);
    });

    it("should detect IPv6 unique local addresses", () => {
      expect(isPrivateIP("fc00::1")).toBe(true);
      expect(isPrivateIP("fd00::1")).toBe(true);
      expect(isPrivateIP("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
    });

    it("should NOT detect public IPv6 addresses as private", () => {
      expect(isPrivateIP("2001:4860:4860::8888")).toBe(false); // Google DNS
      expect(isPrivateIP("2606:4700:4700::1111")).toBe(false); // Cloudflare DNS
    });
  });

  describe("isCloudMetadataEndpoint", () => {
    it("should detect AWS metadata endpoints", () => {
      expect(isCloudMetadataEndpoint("169.254.169.254")).toBe(true);
      expect(isCloudMetadataEndpoint("fd00:ec2::254")).toBe(true);
      expect(isCloudMetadataEndpoint("instance-data")).toBe(true);
      expect(isCloudMetadataEndpoint("instance-data.ec2.internal")).toBe(true);
    });

    it("should detect Google Cloud metadata endpoints", () => {
      expect(isCloudMetadataEndpoint("metadata.google.internal")).toBe(true);
      expect(isCloudMetadataEndpoint("metadata.google.com")).toBe(true);
    });

    it("should detect Kubernetes endpoints", () => {
      expect(isCloudMetadataEndpoint("kubernetes.default")).toBe(true);
      expect(isCloudMetadataEndpoint("kubernetes.default.svc")).toBe(true);
      expect(isCloudMetadataEndpoint("kubernetes.default.svc.cluster.local")).toBe(true);
    });

    it("should detect bind-all addresses", () => {
      expect(isCloudMetadataEndpoint("0.0.0.0")).toBe(true);
      expect(isCloudMetadataEndpoint("::")).toBe(true);
      expect(isCloudMetadataEndpoint("[::]")).toBe(true);
    });

    it("should NOT detect normal hostnames as metadata", () => {
      expect(isCloudMetadataEndpoint("example.com")).toBe(false);
      expect(isCloudMetadataEndpoint("api.example.com")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isCloudMetadataEndpoint("METADATA.GOOGLE.INTERNAL")).toBe(true);
      expect(isCloudMetadataEndpoint("Kubernetes.Default")).toBe(true);
    });
  });

  describe("isLocalhostException", () => {
    it("should detect localhost hostnames", () => {
      expect(isLocalhostException("localhost")).toBe(true);
      expect(isLocalhostException("LOCALHOST")).toBe(true);
      expect(isLocalhostException("127.0.0.1")).toBe(true);
      expect(isLocalhostException("::1")).toBe(true);
      expect(isLocalhostException("[::1]")).toBe(true);
    });

    it("should NOT detect bind-all addresses as localhost", () => {
      expect(isLocalhostException("0.0.0.0")).toBe(false);
      expect(isLocalhostException("::")).toBe(false);
      expect(isLocalhostException("[::]")).toBe(false);
    });

    it("should NOT detect non-localhost as localhost", () => {
      expect(isLocalhostException("example.com")).toBe(false);
      expect(isLocalhostException("127.0.0.2")).toBe(false);
    });
  });

  describe("validateWebhookUrl", () => {
    describe("Valid URLs", () => {
      it("should accept HTTPS public URLs", () => {
        const urls = [
          "https://webhook.example.com/events",
          "https://api.example.org/webhook",
          "https://example.com:8443/webhook"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).not.toThrow();
        });
      });

      it("should accept localhost HTTP when allowed", () => {
        const urls = [
          "http://localhost/webhook",
          "http://localhost:3000/events",
          "http://127.0.0.1/webhook",
          "http://127.0.0.1:8080/events",
          "http://[::1]/webhook"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, true)).not.toThrow();
        });
      });
    });

    describe("Protocol Validation", () => {
      it("should reject non-HTTP/HTTPS protocols", () => {
        const urls = [
          "ftp://example.com/webhook",
          "file:///etc/passwd",
          "javascript:alert(1)",
          "data:text/html,<script>alert(1)</script>"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/protocol/i);
        });
      });

      it("should reject HTTP for non-localhost without allowLocalhost", () => {
        // Public domain should require HTTPS
        expect(() => validateWebhookUrl("http://example.com/webhook", false)).toThrow(/HTTPS/i);

        // Private IPs should be blocked as private IPs (more specific error)
        expect(() => validateWebhookUrl("http://192.168.1.1/webhook", false)).toThrow(
          /private IP address/i
        );
        expect(() => validateWebhookUrl("http://10.0.0.1/webhook", false)).toThrow(
          /private IP address/i
        );
      });
    });

    describe("Cloud Metadata Protection", () => {
      it("should block AWS metadata endpoints", () => {
        const urls = [
          "http://169.254.169.254/latest/meta-data/",
          "https://169.254.169.254/latest/meta-data/iam/security-credentials/",
          "http://instance-data/latest/meta-data/",
          "http://instance-data.ec2.internal/latest/meta-data/"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, true)).toThrow(/cloud metadata endpoint/i);
        });
      });

      it("should block Google Cloud metadata endpoints", () => {
        const urls = [
          "http://metadata.google.internal/computeMetadata/v1/",
          "http://metadata.google.com/computeMetadata/v1/"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, true)).toThrow(/cloud metadata endpoint/i);
        });
      });

      it("should block Kubernetes service discovery", () => {
        // Kubernetes default endpoints are in BLOCKED_HOSTNAMES (cloud metadata)
        const k8sDefaultUrls = [
          "http://kubernetes.default/api",
          "http://kubernetes.default.svc/api",
          "http://kubernetes.default.svc.cluster.local/api"
        ];

        k8sDefaultUrls.forEach((url) => {
          expect(() => validateWebhookUrl(url, true)).toThrow(/cloud metadata endpoint/i);
        });

        // Other k8s services should be blocked by isKubernetesService check
        expect(() => validateWebhookUrl("http://redis.default.svc.cluster.local:6379", true)).toThrow(
          /Kubernetes service/i
        );
      });
    });

    describe("Private IP Protection", () => {
      it("should block RFC1918 private IP ranges", () => {
        const urls = [
          "https://10.0.0.1/webhook",
          "https://192.168.1.1/webhook",
          "https://172.16.0.1/webhook",
          "https://172.31.255.255/webhook"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/private IP address/i);
        });
      });

      it("should block loopback addresses (except allowed localhost)", () => {
        const urls = [
          "https://127.0.0.2/webhook", // Not 127.0.0.1
          "https://127.255.255.255/webhook"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/private IP|localhost/i);
        });
      });

      it("should block link-local addresses", () => {
        const urls = ["https://169.254.1.1/webhook", "https://169.254.255.255/webhook"];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/private IP|cloud metadata/i);
        });
      });

      it("should block IPv6 private ranges", () => {
        const urls = [
          "https://[fc00::1]/webhook",
          "https://[fd00::1]/webhook",
          "https://[fe80::1]/webhook"
        ];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/private IP/i);
        });
      });
    });

    describe("Dangerous Ports Protection", () => {
      it("should block common internal service ports", () => {
        const dangerousPorts = [
          { port: 22, name: "SSH" },
          { port: 3306, name: "MySQL" },
          { port: 5432, name: "PostgreSQL" },
          { port: 6379, name: "Redis" },
          { port: 27017, name: "MongoDB" }
        ];

        dangerousPorts.forEach(({ port }) => {
          const url = `https://example.com:${port}/webhook`;
          expect(() => validateWebhookUrl(url, false)).toThrow(/Port.*internal services/i);
        });
      });

      it("should allow safe ports", () => {
        const safePorts = [80, 443, 8080, 8443, 3000, 4000, 5000];

        safePorts.forEach((port) => {
          const url = `https://example.com:${port}/webhook`;
          expect(() => validateWebhookUrl(url, false)).not.toThrow();
        });
      });
    });

    describe("Localhost Handling", () => {
      it("should block localhost HTTP when allowLocalhost=false", () => {
        const urls = ["http://localhost/webhook", "http://127.0.0.1/webhook"];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/localhost.*allowInsecureWebhooks/i);
        });
      });

      it("should block bind-all addresses even with allowLocalhost=true", () => {
        const urls = ["http://0.0.0.0/webhook", "http://[::]/webhook"];

        urls.forEach((url) => {
          expect(() => validateWebhookUrl(url, true)).toThrow(/cloud metadata|private IP/i);
        });
      });
    });

    describe("Error Messages", () => {
      it("should provide helpful error messages", () => {
        try {
          validateWebhookUrl("http://169.254.169.254/latest/meta-data/", true);
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as Error).message).toContain("cloud metadata endpoint");
          expect((error as Error).message).toContain("sensitive credentials");
        }

        try {
          validateWebhookUrl("https://10.0.0.1/webhook", false);
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as Error).message).toContain("private IP address");
          expect((error as Error).message).toContain("allowInsecureWebhooks");
        }
      });
    });

    describe("Invalid URLs", () => {
      it("should reject malformed URLs", () => {
        // Truly malformed URLs (cannot be parsed)
        const malformedUrls = ["not-a-url", "", "example.com"];

        malformedUrls.forEach((url) => {
          expect(() => validateWebhookUrl(url, false)).toThrow(/Invalid webhook URL/i);
        });
      });

      it("should reject URLs with invalid protocols", () => {
        // Valid URLs but wrong protocol
        expect(() => validateWebhookUrl("htp://example.com", false)).toThrow(/protocol/i);
        expect(() => validateWebhookUrl("ftp://example.com", false)).toThrow(/protocol/i);
      });
    });
  });
});
