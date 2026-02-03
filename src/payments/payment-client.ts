/**
 * PaymentClient - Handles x402 payment header generation for quote-approve flow
 *
 * Creates x402 V2 payment headers for USDC payments on multiple networks.
 * Implements ERC-3009 TransferWithAuthorization signing using viem's EIP-712.
 *
 * v2.3.0: Multi-network support with dynamic chain configuration
 */

import { type Hex, toHex, keccak256, encodePacked } from "viem";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import type { SecurePrivateKey } from "../utils/secure-private-key";
import {
  getNetwork,
  getDefaultNetwork,
  createChainDefinition,
  type NetworkConfig
} from "./networks";

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
  network?: string; // Network name (peaq, base, avalanche) or CAIP-2 format
  networkChainId?: number; // Or chain ID directly
  asset?: string; // Optional override for asset contract
  resourceUrl?: string; // x402 resource URL
}

// x402 constants
export const USDC_DECIMALS = 6;
export const X402_VERSION = 2;
export const DEFAULT_PAYMENT_TIMEOUT_SECONDS = 60;
export const DEFAULT_PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Re-export for backwards compatibility
export const USDC_CONTRACT = "0xbbA60da06c2c5424f03f7434542280FCAd453d10"; // PEAQ USDC
export const PEAQ_CHAIN_ID = "eip155:3338";

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
  const httpUrl = wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

  // Replace /ws endpoint with /x402, or append /x402 if URL doesn't end with /ws
  return /\/ws\/?$/.test(httpUrl)
    ? httpUrl.replace(/\/ws\/?$/, "/x402")
    : httpUrl.replace(/\/?$/, "/x402");
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
 * Settlement data provided by backend in task_quote response.
 * Used for x402x-router-settlement extension.
 */
export interface SettlementData {
  settlementRouter: string;
  salt: string;
  facilitatorFee: string;
  hook: string;
  hookData: string;
}

/**
 * Validates that a string is a valid Ethereum address
 * @param address - String to validate
 * @returns True if valid Ethereum address format
 */
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Resolve network configuration from various input formats
 *
 * @param config - PaymentClientConfig with network options
 * @returns Resolved NetworkConfig
 */
function resolveNetworkConfig(config: PaymentClientConfig): NetworkConfig {
  // Priority: chainId > network name > default
  if (config.networkChainId) {
    return getNetwork(config.networkChainId);
  }
  if (config.network) {
    return getNetwork(config.network);
  }
  return getDefaultNetwork();
}

/**
 * PaymentClient handles creation of x402 V2 payment headers
 * for the quote-approve payment flow.
 *
 * Supports multiple networks with dynamic configuration.
 *
 * @example
 * ```typescript
 * // Default network (PEAQ or TENEO_NETWORK env var)
 * const client = new PaymentClient(secureKey, walletAddress);
 *
 * // Specific network by name
 * const baseClient = new PaymentClient(secureKey, walletAddress, {
 *   network: "base"
 * });
 *
 * // Specific network by chain ID
 * const avaxClient = new PaymentClient(secureKey, walletAddress, {
 *   networkChainId: 43114
 * });
 * ```
 */
export class PaymentClient {
  private readonly secureKey: SecurePrivateKey;
  private readonly walletAddress: string;
  private readonly networkConfig: NetworkConfig;
  private readonly assetOverride?: string;
  private readonly resourceUrl: string;

  constructor(
    secureKey: SecurePrivateKey,
    walletAddress: string,
    config: PaymentClientConfig = {}
  ) {
    if (!isValidEthereumAddress(walletAddress)) {
      throw new Error(`Invalid wallet address: ${walletAddress}`);
    }
    this.secureKey = secureKey;
    this.walletAddress = walletAddress;
    this.networkConfig = resolveNetworkConfig(config);
    this.assetOverride = config.asset;
    this.resourceUrl = config.resourceUrl ?? "";
  }

  /**
   * Get the current network configuration
   */
  get network(): NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Get the USDC contract address for the current network
   */
  get asset(): string {
    return this.assetOverride ?? this.networkConfig.usdcContract;
  }

  /**
   * Get the CAIP-2 network identifier
   */
  get caip2(): string {
    return this.networkConfig.caip2;
  }

  /**
   * Creates an x402 V2 payment header for a specific amount and recipient.
   *
   * @param amountMicroUnits - Amount in micro-units (e.g., 1000 = 0.001 USDC)
   * @param recipientAddress - Wallet address of the payment recipient (agent)
   * @param resourceUrl - Optional override for x402 resource URL
   * @param networkOverride - Optional network override for this specific payment
   * @param settlementData - Backend-provided settlement data for x402x-router-settlement
   * @returns Base64 encoded x402 V2 payment header
   */
  async createPaymentHeader(
    amountMicroUnits: number,
    recipientAddress: string,
    resourceUrl?: string,
    networkOverride?: string | number,
    settlementData?: SettlementData
  ): Promise<string> {
    if (!isValidEthereumAddress(recipientAddress)) {
      throw new Error(`Invalid recipient address: ${recipientAddress}`);
    }
    const resource = resourceUrl || this.resourceUrl || this.getDefaultResourceUrl();
    const amountStr = Math.round(amountMicroUnits).toString();

    // Resolve network for this payment (allows per-request override)
    const network = networkOverride ? getNetwork(networkOverride) : this.networkConfig;

    const asset = this.assetOverride ?? network.usdcContract;
    const chain = createChainDefinition(network);

    // Create payment header using the secure key
    const header = await this.secureKey.use(async (privateKey) => {
      const account = privateKeyToAccount(privateKey as `0x${string}`);

      // Time bounds for the authorization (valid for 60 seconds)
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now - 60; // Valid from 60 seconds ago
      const validBefore = now + 60; // Valid until 60 seconds from now

      // Use backend-provided settlement data or fall back to defaults
      // CRITICAL: For x402x-router-settlement to work, we MUST use the values
      // provided by the backend in the task_quote response
      const salt = settlementData?.salt as Hex ?? generateNonce();
      const facilitatorFee = settlementData?.facilitatorFee ?? "1000";
      const hookData = (settlementData?.hookData ?? "0x") as Hex;
      const settlementRouter = settlementData?.settlementRouter ?? network.settlementRouter;
      const hook = settlementData?.hook ?? network.transferHook;

      // Calculate commitment hash (becomes the EIP-3009 nonce)
      // This cryptographically binds all settlement parameters to the signature
      const commitment = keccak256(
        encodePacked(
          [
            "string",   // Protocol identifier
            "uint256",  // Chain ID
            "address",  // Hub (settlementRouter)
            "address",  // Token (USDC)
            "address",  // From (payer)
            "uint256",  // Value
            "uint256",  // Valid after
            "uint256",  // Valid before
            "bytes32",  // Salt
            "address",  // Pay to (final recipient)
            "uint256",  // Facilitator fee
            "address",  // Hook
            "bytes32"   // keccak256(hookData)
          ],
          [
            "X402/settle/v1",
            BigInt(chain.id),
            settlementRouter as Hex,
            asset as Hex,
            account.address,
            BigInt(amountStr),
            BigInt(validAfter),
            BigInt(validBefore),
            salt as Hex,
            recipientAddress as Hex,
            BigInt(facilitatorFee),
            hook as Hex,
            keccak256(hookData)
          ]
        )
      );

      // EIP-712 domain using network-specific parameters
      const domain = {
        name: network.eip712.name,
        version: network.eip712.version,
        chainId: BigInt(chain.id),
        verifyingContract: asset as `0x${string}`
      };

      // ERC-3009 TransferWithAuthorization message
      // x402x: "to" is settlementRouter, nonce is commitment hash
      const message = {
        from: account.address,
        to: settlementRouter as `0x${string}`, // Router receives funds first
        value: BigInt(amountStr),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: commitment // Commitment hash as nonce
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
          to: settlementRouter, // Router address
          value: amountStr,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: commitment // Commitment hash
        },
        signature: signature
      };

      // Convert facilitator fee to hex format (required by facilitator)
      const facilitatorFeeHex = `0x${BigInt(facilitatorFee).toString(16)}`;

      // Build V2 payload with x402x-router-settlement extension
      const v2Payload = {
        x402Version: 2,
        resource: {
          url: resource,
          description: "Teneo SDK payment",
          mimeType: "application/json"
        },
        accepted: {
          scheme: "exact",
          network: network.caip2,
          amount: amountStr,
          asset: asset,
          payTo: recipientAddress, // Final recipient (for display)
          maxTimeoutSeconds: 60,
          extra: {
            name: network.eip712.name,
            version: network.eip712.version,
            // Settlement router info - MUST include all fields for facilitator
            settlementRouter: settlementRouter,
            salt: salt,
            payTo: recipientAddress, // finalPayTo
            facilitatorFee: facilitatorFeeHex, // Must be hex format
            hook: hook,
            hookData: hookData
          }
        },
        payload: v1Payload,
        // x402x router settlement extension (v2 format)
        extensions: {
          "x402x-router-settlement": {
            info: {
              settlementRouter: settlementRouter,
              hook: hook,
              hookData: hookData,
              facilitatorFee: facilitatorFeeHex, // Must be hex format
              salt: salt,
              finalPayTo: recipientAddress // Final recipient of the payment
            }
          }
        }
      };

      return Buffer.from(JSON.stringify(v2Payload)).toString("base64");
    });

    return header;
  }

  /**
   * Get resource URL for x402 payments.
   * Throws if no resource URL is configured.
   */
  private getDefaultResourceUrl(): string {
    if (!this.resourceUrl) {
      throw new Error(
        "Resource URL not configured. Pass resourceUrl to PaymentClient or use buildX402ResourceUrl(wsUrl)."
      );
    }
    return this.resourceUrl;
  }

  /**
   * Gets the wallet address associated with this payment client.
   */
  get address(): string {
    return this.walletAddress;
  }
}
