/**
 * Payment configuration for x402 protocol
 * Contains chain configs, contract addresses, and utility functions
 */

import { defineChain } from "viem";

/**
 * PEAQ chain configuration for viem
 */
export const PEAQ_CHAIN = defineChain({
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
  },
  blockExplorers: {
    default: { name: "Subscan", url: "https://peaq.subscan.io" }
  }
});

/**
 * Default RPC URL for PEAQ chain
 */
export const DEFAULT_RPC_URL = "https://peaq.api.onfinality.io/public";

/**
 * USDC contract address on PEAQ chain
 */
export const USDC_CONTRACT = "0xbbA60da06c2c5424f03f7434542280FCAd453d10" as const;

/**
 * Default backend payment address for centralized settlement
 * The backend handles distribution to agents
 */
export const DEFAULT_PAY_TO_ADDRESS = "0xd409943eD69aDe02d0B25D0cbc47dc43b7391c34" as const;

/**
 * USDC has 6 decimals
 */
export const USDC_DECIMALS = 6;

/**
 * x402 protocol version
 */
export const X402_VERSION = 1;

/**
 * Default timeout for x402 payments in seconds
 */
export const DEFAULT_PAYMENT_TIMEOUT_SECONDS = 60;

/**
 * Supported chain types for payments
 */
export type SupportedChain = "peaq";

/**
 * Builds the x402 resource URL from a WebSocket URL
 * Converts ws:// to http:// (or wss:// to https://) and replaces /ws with /x402
 *
 * @param wsUrl - The WebSocket URL (e.g., "wss://coordinator.teneo.pro/ws")
 * @returns The x402 resource URL (e.g., "https://coordinator.teneo.pro/x402")
 *
 * @example
 * ```typescript
 * buildX402ResourceUrl("ws://localhost:8080/ws");
 * // Returns: "http://localhost:8080/x402"
 *
 * buildX402ResourceUrl("wss://coordinator.teneo.pro/ws");
 * // Returns: "https://coordinator.teneo.pro/x402"
 * ```
 */
export function buildX402ResourceUrl(wsUrl: string): string {
  // Convert ws:// to http:// (or wss:// to https://)
  const httpUrl = wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
  // Replace /ws with /x402
  return httpUrl.replace(/\/ws$/, "/x402");
}

/**
 * Converts USDC amount to token units (smallest denomination)
 *
 * @param amountUsdc - Amount in USDC (e.g., 0.001 for $0.001)
 * @returns Amount in token units as string (e.g., "1000" for 0.001 USDC)
 */
export function usdcToUnits(amountUsdc: number): string {
  return Math.round(amountUsdc * Math.pow(10, USDC_DECIMALS)).toString();
}

/**
 * Converts token units to USDC amount
 *
 * @param units - Amount in token units (e.g., "1000")
 * @returns Amount in USDC (e.g., 0.001)
 */
export function unitsToUsdc(units: string | bigint): number {
  const unitsNum = typeof units === "bigint" ? Number(units) : parseInt(units, 10);
  return unitsNum / Math.pow(10, USDC_DECIMALS);
}
