/**
 * Network configuration for multi-network payment support (v2.3.0)
 *
 * Provides network-specific configuration for USDC payments on supported chains.
 * Each network includes RPC URLs, contract addresses, and EIP-712 parameters.
 */

import { defineChain, type Chain } from "viem";

/**
 * Network configuration interface for payment operations
 */
export interface NetworkConfig {
  chainId: number;
  name: string;
  caip2: string;
  rpcUrl: string;
  usdcContract: string;
  settlementRouter: string;
  transferHook: string;
  eip712: {
    name: string;
    version: string;
  };
}

/**
 * Supported network configurations
 *
 * Each network contains the necessary contract addresses and parameters
 * for executing USDC payments via x402 protocol.
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  peaq: {
    chainId: 3338,
    name: "PEAQ Mainnet",
    caip2: "eip155:3338",
    rpcUrl: "https://peaq.api.onfinality.io/public",
    usdcContract: "0xbbA60da06c2c5424f03f7434542280FCAd453d10",
    settlementRouter: "0xCD57f4596f70b18a0fd0c42daa4F3066d3adc8d4",
    transferHook: "0xf45FA7713a58eBd0C353186F9e49A7C39a0eD34E",
    eip712: { name: "USDC", version: "2" }
  },
  base: {
    chainId: 8453,
    name: "Base Mainnet",
    caip2: "eip155:8453",
    rpcUrl: "https://mainnet.base.org",
    usdcContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    settlementRouter: "0x73fc659Cd5494E69852bE8D9D23FE05Aab14b29B",
    transferHook: "0x081258287F692D61575387ee2a4075f34dd7Aef7",
    eip712: { name: "USD Coin", version: "2" }
  },
  avalanche: {
    chainId: 43114,
    name: "Avalanche Mainnet",
    caip2: "eip155:43114",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    usdcContract: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    settlementRouter: "0xF38709cFd3f89734c231dd8E59Ff1d44caCddEe8",
    transferHook: "0x6D21298950dC58a984664B12Cdf4DeBA143889aa",
    eip712: { name: "USD Coin", version: "2" }
  }
};

/**
 * Chain ID to network name mapping for reverse lookup
 */
export const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  3338: "peaq",
  8453: "base",
  43114: "avalanche"
};

/**
 * CAIP-2 to network name mapping
 */
export const CAIP2_TO_NETWORK: Record<string, string> = {
  "eip155:3338": "peaq",
  "eip155:8453": "base",
  "eip155:43114": "avalanche"
};

/**
 * Get network configuration by name, chain ID, or CAIP-2 identifier
 *
 * @param nameOrChainId - Network name (peaq, base, avalanche), chain ID, or CAIP-2 format
 * @returns NetworkConfig for the requested network
 * @throws Error if network is not supported
 *
 * @example
 * ```typescript
 * // By name
 * const peaq = getNetwork("peaq");
 *
 * // By chain ID
 * const base = getNetwork(8453);
 *
 * // By CAIP-2
 * const avalanche = getNetwork("eip155:43114");
 * ```
 */
export function getNetwork(nameOrChainId: string | number): NetworkConfig {
  // Handle chain ID
  if (typeof nameOrChainId === "number") {
    const name = CHAIN_ID_TO_NETWORK[nameOrChainId];
    if (!name) {
      throw new Error(
        `Unknown chain ID: ${nameOrChainId}. Supported chain IDs: ${Object.keys(CHAIN_ID_TO_NETWORK).join(", ")}`
      );
    }
    return NETWORKS[name];
  }

  // Handle CAIP-2 format (eip155:XXXX)
  if (nameOrChainId.startsWith("eip155:")) {
    const name = CAIP2_TO_NETWORK[nameOrChainId];
    if (!name) {
      throw new Error(
        `Unknown CAIP-2 network: ${nameOrChainId}. Supported networks: ${Object.keys(CAIP2_TO_NETWORK).join(", ")}`
      );
    }
    return NETWORKS[name];
  }

  // Handle network name
  const network = NETWORKS[nameOrChainId.toLowerCase()];
  if (!network) {
    throw new Error(
      `Unknown network: ${nameOrChainId}. Supported networks: ${Object.keys(NETWORKS).join(", ")}`
    );
  }
  return network;
}

/**
 * Get the default network from environment or fallback to PEAQ
 *
 * Priority:
 * 1. TENEO_NETWORK environment variable
 * 2. Default to PEAQ
 *
 * @returns NetworkConfig for the default network
 *
 * @example
 * ```typescript
 * // Uses TENEO_NETWORK env var if set, otherwise PEAQ
 * const network = getDefaultNetwork();
 * console.log(network.name); // "PEAQ Mainnet" (default)
 * ```
 */
export function getDefaultNetwork(): NetworkConfig {
  const envNetwork = process.env.TENEO_NETWORK;
  if (envNetwork) {
    try {
      return getNetwork(envNetwork);
    } catch {
      // Fall through to default if env var is invalid
      console.warn(`Invalid TENEO_NETWORK: ${envNetwork}, falling back to PEAQ`);
    }
  }
  return NETWORKS["peaq"];
}

/**
 * Create a viem Chain definition for a network
 *
 * @param network - NetworkConfig to create chain from
 * @returns viem Chain definition
 */
export function createChainDefinition(network: NetworkConfig): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    network: network.name.toLowerCase().replace(/\s+/g, "-"),
    nativeCurrency: {
      decimals: 18,
      name: network.name.split(" ")[0], // Use first word as currency name
      symbol: network.name === "PEAQ Mainnet" ? "PEAQ" : network.name === "Avalanche Mainnet" ? "AVAX" : "ETH"
    },
    rpcUrls: {
      default: {
        http: [network.rpcUrl]
      },
      public: {
        http: [network.rpcUrl]
      }
    }
  });
}

/**
 * Check if a network is supported
 *
 * @param nameOrChainId - Network name, chain ID, or CAIP-2 identifier
 * @returns true if the network is supported
 */
export function isNetworkSupported(nameOrChainId: string | number): boolean {
  try {
    getNetwork(nameOrChainId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all supported network names
 *
 * @returns Array of supported network names
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS);
}
