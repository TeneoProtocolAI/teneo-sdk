/**
 * SSRF (Server-Side Request Forgery) Validator
 * Prevents webhook URLs from pointing to internal/private network resources
 *
 * This utility blocks:
 * - Private IP ranges (RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Loopback addresses (127.0.0.0/8, ::1)
 * - Link-local addresses (169.254.0.0/16, fe80::/10)
 * - Cloud metadata endpoints (AWS, GCP, Azure, DigitalOcean)
 * - IPv6 private ranges (fc00::/7, fd00::/8)
 * - Multicast and broadcast addresses
 */

import { URL } from "url";

/**
 * Blocked hostnames that should never be accessible via webhooks
 * Includes cloud provider metadata endpoints and localhost variations
 */
const BLOCKED_HOSTNAMES = [
  // AWS metadata endpoints
  "169.254.169.254",
  "fd00:ec2::254",
  "instance-data",
  "instance-data.ec2.internal",

  // Google Cloud metadata
  "metadata.google.internal",
  "metadata.google.com",

  // Azure metadata
  "169.254.169.254", // Same as AWS

  // DigitalOcean metadata
  "169.254.169.254", // Same as AWS/Azure

  // Kubernetes metadata
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",

  // Localhost bind-all (not safe for webhooks)
  "0.0.0.0",
  "[::]",
  "::"
];

/**
 * Localhost hostnames that are allowed for development
 */
const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "::1", "[::1]"];

/**
 * Check if an IP address is in a private range
 * Supports both IPv4 and IPv6
 */
export function isPrivateIP(hostname: string): boolean {
  // Remove IPv6 brackets if present
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");

  // IPv4 private ranges (RFC1918)
  if (/^10\./.test(cleanHostname)) return true;
  if (/^192\.168\./.test(cleanHostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHostname)) return true; // 172.16-31

  // IPv4 loopback (127.0.0.0/8)
  if (/^127\./.test(cleanHostname)) return true;

  // IPv4 link-local (169.254.0.0/16)
  if (/^169\.254\./.test(cleanHostname)) return true;

  // IPv4 multicast (224.0.0.0/4)
  if (/^2(2[4-9]|3[0-9])\./.test(cleanHostname)) return true;

  // IPv4 broadcast
  if (cleanHostname === "255.255.255.255") return true;

  // IPv6 private ranges
  // Link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(cleanHostname)) return true;

  // Unique local addresses (fc00::/7)
  if (/^f[cd][0-9a-f]{2}:/i.test(cleanHostname)) return true;

  // IPv6 loopback (::1)
  if (cleanHostname === "::1") return true;
  if (cleanHostname === "0:0:0:0:0:0:0:1") return true;

  // IPv6 unspecified (::)
  if (cleanHostname === "::") return true;
  if (cleanHostname === "0:0:0:0:0:0:0:0") return true;

  return false;
}

/**
 * Check if a hostname is a blocked cloud metadata endpoint
 */
export function isCloudMetadataEndpoint(hostname: string): boolean {
  const cleanHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return BLOCKED_HOSTNAMES.some(
    (blocked) =>
      cleanHostname === blocked.toLowerCase() || cleanHostname.endsWith(`.${blocked.toLowerCase()}`)
  );
}

/**
 * Check if a hostname is an allowed localhost exception
 * Only true localhost addresses, not bind-all addresses
 */
export function isLocalhostException(hostname: string): boolean {
  const cleanHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return LOCALHOST_HOSTNAMES.some((allowed) => cleanHostname === allowed.toLowerCase());
}

/**
 * Check if hostname resolves to a Kubernetes service
 * Blocks internal k8s service discovery
 */
function isKubernetesService(hostname: string): boolean {
  const cleanHostname = hostname.toLowerCase();

  // Block .svc, .svc.cluster, .svc.cluster.local
  if (cleanHostname.includes(".svc")) return true;

  // Block direct kubernetes service names
  if (cleanHostname.startsWith("kubernetes")) return true;

  return false;
}

/**
 * Validate a webhook URL for SSRF vulnerabilities
 * Throws an error if the URL is unsafe
 *
 * @param url - The webhook URL to validate
 * @param allowLocalhost - Whether to allow localhost URLs (for development)
 * @throws Error if URL is unsafe or invalid
 */
export function validateWebhookUrl(url: string, allowLocalhost: boolean = false): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Invalid webhook URL: ${(error as Error).message}`);
  }

  const hostname = parsed.hostname;

  // Check protocol first (basic validation)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use HTTP or HTTPS protocol (got: ${parsed.protocol})`);
  }

  // Block cloud metadata endpoints FIRST (before any other checks)
  if (isCloudMetadataEndpoint(hostname)) {
    throw new Error(
      `Webhook URL blocked for security: ${hostname} is a cloud metadata endpoint. ` +
        "This could expose sensitive credentials and secrets."
    );
  }

  // Block Kubernetes services
  if (isKubernetesService(hostname)) {
    throw new Error(
      `Webhook URL blocked for security: ${hostname} appears to be a Kubernetes service. ` +
        "Internal service discovery is not allowed for webhooks."
    );
  }

  // Check localhost BEFORE private IP check (localhost is specific case of private IP)
  if (isLocalhostException(hostname)) {
    if (allowLocalhost) {
      return; // Localhost is allowed for development
    } else {
      throw new Error(
        `Webhook URL blocked: ${hostname} is a localhost address. ` +
          "Set allowInsecureWebhooks=true to allow localhost webhooks for testing."
      );
    }
  }

  // Block private IP ranges
  if (isPrivateIP(hostname)) {
    throw new Error(
      `Webhook URL blocked for security: ${hostname} is a private IP address. ` +
        "Webhooks cannot point to internal network resources. " +
        "Use a publicly accessible endpoint or set allowInsecureWebhooks=true for testing."
    );
  }

  // For non-HTTPS, only allow localhost (which already passed checks above)
  if (parsed.protocol === "http:") {
    throw new Error(
      "Webhook URL must use HTTPS for non-localhost endpoints. " +
        "Use HTTPS or set allowInsecureWebhooks=true for testing with localhost."
    );
  }

  // Additional safety: block ports that are commonly internal
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    const dangerousPorts = [
      22, // SSH
      23, // Telnet
      25, // SMTP
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      9200, // Elasticsearch
      27017 // MongoDB
    ];

    if (dangerousPorts.includes(port)) {
      throw new Error(
        `Webhook URL blocked for security: Port ${port} is commonly used for internal services. ` +
          "Use a different port or set allowInsecureWebhooks=true for testing."
      );
    }
  }
}
