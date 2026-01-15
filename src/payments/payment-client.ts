/**
 * PaymentClient - Handles x402 payment header generation for quote-approve flow
 *
 * Creates x402 V2 payment headers for USDC payments on PEAQ network.
 * Implements ERC-3009 TransferWithAuthorization signing using viem's EIP-712.
 */

import { defineChain, type Hex, toHex } from "viem";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import type { SecurePrivateKey } from "../utils/secure-private-key";

// PEAQ chain definition
const peaq = defineChain({
  id: 3338,
  name: "peaq",
  network: "peaq",
  nativeCurrency: {
    decimals: 18,
    name: "PEAQ",
    symbol: "PEAQ"
  },
  rpcUrls: {
    default: {
      http: ["https://peaq.api.onfinality.io/public"]
    },
    public: {
      http: ["https://peaq.api.onfinality.io/public"]
    }
  }
});

// USDC contract on PEAQ
const USDC_CONTRACT = "0xbbA60da06c2c5424f03f7434542280FCAd453d10";
const PEAQ_NETWORK_CAIP2 = "eip155:3338";

// ERC-3009 TransferWithAuthorization EIP-712 types
const ERC3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const;

export interface PaymentClientConfig {
  network?: string; // CAIP-2 format, default: "eip155:3338"
  asset?: string; // Asset contract, default: USDC on PEAQ
  resourceUrl?: string; // x402 resource URL
}

// x402 constants
export const USDC_DECIMALS = 6;
export const X402_VERSION = 2;
export const DEFAULT_PAYMENT_TIMEOUT_SECONDS = 60;
export const DEFAULT_PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEFAULT_RPC_URL = "https://peaq.api.onfinality.io/public";
export type SupportedChain = "peaq";

// Re-export constants for external use
export { USDC_CONTRACT, PEAQ_NETWORK_CAIP2 as PEAQ_CHAIN_ID };

/**
 * Converts a WebSocket URL to an HTTP(S) URL for x402 resource specification.
 * The x402 protocol requires HTTP URLs, not WebSocket URLs.
 *
 * @param wsUrl - WebSocket URL (wss:// or ws://)
 * @returns HTTP URL (https:// or http://)
 *
 * @example
 * buildX402ResourceUrl("wss://api.teneo.com/ws") // "https://api.teneo.com/x402"
 */
export function buildX402ResourceUrl(wsUrl: string): string {
  return wsUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/ws\/?$/, "/x402")
    .replace(/\/?$/, "/x402");
}

/**
 * Converts USDC human-readable amount to micro-units (6 decimals).
 * @param usdc - Amount in USDC (e.g., 1.5)
 * @returns Amount in micro-units (e.g., 1500000)
 */
export function usdcToUnits(usdc: number): number {
  return Math.round(usdc * 10 ** USDC_DECIMALS);
}

/**
 * Converts micro-units to USDC human-readable amount.
 * @param units - Amount in micro-units (e.g., 1500000)
 * @returns Amount in USDC (e.g., 1.5)
 */
export function unitsToUsdc(units: number): number {
  return units / 10 ** USDC_DECIMALS;
}

/**
 * Generate a random 32-byte nonce as hex string
 */
function generateNonce(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return toHex(randomBytes);
}

/**
 * PaymentClient handles creation of x402 V2 payment headers
 * for the quote-approve payment flow.
 */
export class PaymentClient {
  private readonly secureKey: SecurePrivateKey;
  private readonly walletAddress: string;
  private readonly network: string;
  private readonly asset: string;
  private readonly resourceUrl: string;

  constructor(
    secureKey: SecurePrivateKey,
    walletAddress: string,
    config: PaymentClientConfig = {}
  ) {
    this.secureKey = secureKey;
    this.walletAddress = walletAddress;
    this.network = config.network ?? PEAQ_NETWORK_CAIP2;
    this.asset = config.asset ?? USDC_CONTRACT;
    this.resourceUrl = config.resourceUrl ?? "";
  }

  /**
   * Creates an x402 V2 payment header for a specific amount and recipient.
   *
   * @param amountMicroUnits - Amount in micro-units (e.g., 1000 = 0.001 USDC)
   * @param recipientAddress - Wallet address of the payment recipient (agent)
   * @param resourceUrl - Optional override for x402 resource URL
   * @returns Base64 encoded x402 V2 payment header
   */
  async createPaymentHeader(
    amountMicroUnits: number,
    recipientAddress: string,
    resourceUrl?: string
  ): Promise<string> {
    const resource = resourceUrl || this.resourceUrl || this.getDefaultResourceUrl();
    const amountStr = Math.round(amountMicroUnits).toString();

    // Create payment header using the secure key
    const header = await this.secureKey.use(async (privateKey) => {
      const account = privateKeyToAccount(privateKey as `0x${string}`);

      // Time bounds for the authorization (valid for 60 seconds)
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now - 60; // Valid from 60 seconds ago
      const validBefore = now + 60; // Valid until 60 seconds from now
      const nonce = generateNonce();

      // EIP-712 domain for USDC on PEAQ
      const domain = {
        name: "USDC",
        version: "2",
        chainId: BigInt(peaq.id),
        verifyingContract: this.asset as `0x${string}`
      };

      // ERC-3009 TransferWithAuthorization message
      const message = {
        from: account.address,
        to: recipientAddress as `0x${string}`,
        value: BigInt(amountStr),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce
      };

      // Sign the EIP-712 typed data
      const signature = await signTypedData({
        privateKey: privateKey as `0x${string}`,
        domain,
        types: ERC3009_TYPES,
        primaryType: "TransferWithAuthorization",
        message
      });

      // Build V1 payload (authorization data)
      const v1Payload = {
        authorization: {
          from: account.address,
          to: recipientAddress,
          value: amountStr,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce
        },
        signature: signature
      };

      // Build V2 payload (what the backend expects)
      const v2Payload = {
        x402Version: 2,
        resource: {
          url: resource,
          description: "Teneo SDK payment",
          mimeType: "application/json"
        },
        accepted: {
          scheme: "exact",
          network: this.network,
          amount: amountStr,
          asset: this.asset,
          payTo: recipientAddress,
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", version: "2" }
        },
        payload: v1Payload
      };

      return Buffer.from(JSON.stringify(v2Payload)).toString("base64");
    });

    return header;
  }

  /**
   * Get default x402 resource URL from WebSocket URL
   */
  private getDefaultResourceUrl(): string {
    // Default fallback
    return "https://dev-rooms-websocket-ai-core-o9fmb.ondigitalocean.app/x402";
  }

  /**
   * Gets the wallet address associated with this payment client.
   */
  get address(): string {
    return this.walletAddress;
  }
}
