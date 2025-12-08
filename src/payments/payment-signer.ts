/**
 * PaymentSigner - Generates x402 payment headers for Teneo Protocol
 * Uses viem for wallet operations and x402 library for payment header creation
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  publicActions,
  type PublicClient
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createPaymentHeader } from "x402/client";
import type { PaymentRequirements, Signer } from "x402/types";


import {
  PEAQ_CHAIN,
  USDC_CONTRACT,
  DEFAULT_PAY_TO_ADDRESS,
  DEFAULT_RPC_URL,
  X402_VERSION,
  DEFAULT_PAYMENT_TIMEOUT_SECONDS,
  usdcToUnits,
  type SupportedChain
} from "./payment-config";

/**
 * Configuration for PaymentSigner
 */
export interface PaymentSignerConfig {
  /** Private key for signing payments (hex string with 0x prefix) */
  privateKey: string;
  /** Chain to use for payments (default: "peaq") */
  chain?: SupportedChain;
  /** Custom RPC URL (default: PEAQ public RPC) */
  rpcUrl?: string;
  /** Default pay-to address (default: backend settlement address) */
  payToAddress?: string;
}

/**
 * Options for creating a payment header
 */
export interface CreatePaymentHeaderOptions {
  /** Amount in USDC (e.g., 0.001 for $0.001) */
  amountUsdc: number;
  /** x402 resource URL (e.g., "https://coordinator.teneo.pro/x402") */
  resourceUrl: string;
  /** Override the default pay-to address */
  payTo?: string;
  /** Payment description (optional) */
  description?: string;
  /** Timeout in seconds (default: 60) */
  timeoutSeconds?: number;
}

/**
 * USDC ERC20 ABI for balance checks
 */
const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

/**
 * PaymentSigner handles x402 payment header generation
 *
 * @example
 * ```typescript
 * const signer = new PaymentSigner({
 *   privateKey: "0x..."
 * });
 *
 * const paymentHeader = await signer.createPaymentHeader({
 *   amountUsdc: 0.001,
 *   resourceUrl: "https://coordinator.teneo.pro/x402"
 * });
 * ```
 */
export class PaymentSigner {
  private readonly account: PrivateKeyAccount;
  private readonly walletClient: Signer;
  private readonly publicClient: PublicClient;
  private readonly payToAddress: string;
  private readonly rpcUrl: string;

  constructor(config: PaymentSignerConfig) {
    const { privateKey, rpcUrl = DEFAULT_RPC_URL, payToAddress = DEFAULT_PAY_TO_ADDRESS } = config;

    // Create account from private key
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    // Store config
    this.rpcUrl = rpcUrl;
    this.payToAddress = payToAddress;

    // Create wallet client for signing
    // Extend with publicActions to satisfy x402's Signer type requirements
    this.walletClient = createWalletClient({
      account: this.account,
      chain: PEAQ_CHAIN,
      transport: http(this.rpcUrl)
    }).extend(publicActions) as Signer;

    // Create public client for reading chain data
    this.publicClient = createPublicClient({
      chain: PEAQ_CHAIN,
      transport: http(this.rpcUrl)
    });
  }

  /**
   * Gets the signer's wallet address
   *
   * @returns The wallet address as a hex string
   */
  public getAddress(): string {
    return this.account.address;
  }

  /**
   * Gets the USDC balance for the signer's wallet
   *
   * @returns The balance in token units (bigint)
   */
  public async getBalance(): Promise<bigint> {
    const balance = await this.publicClient.readContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [this.account.address]
    });

    return balance;
  }

  /**
   * Creates an x402 payment header for a transaction
   *
   * @param options - Payment options
   * @returns Base64-encoded payment header string
   * @throws Error if payment header creation fails
   *
   * @example
   * ```typescript
   * const header = await signer.createPaymentHeader({
   *   amountUsdc: 0.001,
   *   resourceUrl: "https://coordinator.teneo.pro/x402"
   * });
   * // Returns: "eyJ0eXBlIjoiZXhhY3QiLC..." (base64 encoded)
   * ```
   */
  public async createPaymentHeader(options: CreatePaymentHeaderOptions): Promise<string> {
    const {
      amountUsdc,
      resourceUrl,
      payTo = this.payToAddress,
      description = "Teneo Protocol AI interaction",
      timeoutSeconds = DEFAULT_PAYMENT_TIMEOUT_SECONDS
    } = options;

    // Convert USDC to token units
    const paymentUnits = usdcToUnits(amountUsdc);

    // Build payment requirements for x402
    const paymentRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "peaq",
      maxAmountRequired: paymentUnits,
      asset: USDC_CONTRACT,
      payTo: payTo as `0x${string}`,
      resource: resourceUrl,
      description,
      mimeType: "application/json",
      maxTimeoutSeconds: timeoutSeconds,
      extra: {
        name: "USDC",
        version: "2"
      }
    };

    // Create signed payment header using x402 library
    const paymentHeader = await createPaymentHeader(
      this.walletClient,
      X402_VERSION,
      paymentRequirements
    );

    return paymentHeader;
  }
}
