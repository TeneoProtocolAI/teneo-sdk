import { defineChain, type Chain } from "viem";
import { z } from "zod";

// Zod schema for runtime validation
const NetworkConfigSchema = z.object({
  chainId: z.number(),
  name: z.string(),
  caip2: z.string(),
  rpcUrl: z.string().url(),
  usdcContract: z.string(),
  settlementRouter: z.string(),
  transferHook: z.string(),
  eip712: z.object({
    name: z.string(),
    version: z.string()
  })
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

let cachedNetworks: Record<string, NetworkConfig> | null = null;
let networksFetchPromise: Promise<Record<string, NetworkConfig>> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export let NETWORKS: Record<string, NetworkConfig> = {};

// Dynamic lookup mappings - populated from backend response in fetchNetworkConfigs()
export let CHAIN_ID_TO_NETWORK: Record<number, string> = {};
export let CAIP2_TO_NETWORK: Record<string, string> = {};

let backendUrl: string | null = null;

export function setNetworkConfigUrl(url: string): void {
  backendUrl = url
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/ws\/?$/, "");
}

export async function fetchNetworkConfigs(): Promise<Record<string, NetworkConfig>> {
  if (cachedNetworks && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedNetworks;
  }

  if (networksFetchPromise) {
    return networksFetchPromise;
  }

  if (!backendUrl) {
    throw new Error("Backend URL not set. Call setNetworkConfigUrl() before initializing networks.");
  }

  networksFetchPromise = (async () => {
    try {
      const response = await fetch(`${backendUrl}/api/networks`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.networks || typeof data.networks !== "object" || Object.keys(data.networks).length === 0) {
        throw new Error("Invalid or empty network config response");
      }

      // Validate each network config gracefully - skip invalid ones
      const validatedNetworks: Record<string, NetworkConfig> = {};
      const invalidNetworks: string[] = [];

      for (const [name, config] of Object.entries(data.networks)) {
        const result = NetworkConfigSchema.safeParse(config);
        if (result.success) {
          validatedNetworks[name] = result.data;
        } else {
          invalidNetworks.push(name);
          console.warn(`[Networks] Skipping invalid network "${name}":`, result.error.issues.map(i => i.message).join(", "));
        }
      }

      // If no valid networks, fall back to cache or throw
      if (Object.keys(validatedNetworks).length === 0) {
        if (cachedNetworks) {
          console.warn("[Networks] All networks invalid, using cached config");
          return cachedNetworks;
        }
        throw new Error(`All network configs failed validation. Invalid: ${invalidNetworks.join(", ")}`);
      }

      // Log warnings if some networks were invalid
      if (invalidNetworks.length > 0) {
        console.warn(`[Networks] ${invalidNetworks.length} network(s) failed validation and were skipped: ${invalidNetworks.join(", ")}`);
      }

      cachedNetworks = validatedNetworks;
      lastFetchTime = Date.now();
      NETWORKS = { ...validatedNetworks };

      // Build dynamic lookup mappings from validated networks
      CHAIN_ID_TO_NETWORK = {};
      CAIP2_TO_NETWORK = {};
      for (const [name, config] of Object.entries(validatedNetworks)) {
        CHAIN_ID_TO_NETWORK[config.chainId] = name;
        CAIP2_TO_NETWORK[config.caip2] = name;
      }

      console.log("[Networks] Fetched from backend:", Object.keys(validatedNetworks).join(", "));
      return validatedNetworks;
    } catch (error) {
      if (cachedNetworks) {
        console.warn("[Networks] Backend unavailable, using cached config");
        return cachedNetworks;
      }
      throw new Error(`Failed to fetch network configs and no cache available: ${error}`);
    } finally {
      networksFetchPromise = null;
    }
  })();

  return networksFetchPromise;
}

export async function initializeNetworks(): Promise<void> {
  await fetchNetworkConfigs();
}

export function getNetwork(nameOrChainId: string | number): NetworkConfig {
  if (Object.keys(NETWORKS).length === 0) {
    throw new Error("Networks not initialized. Call initializeNetworks() first.");
  }

  if (typeof nameOrChainId === "number") {
    const name = CHAIN_ID_TO_NETWORK[nameOrChainId];
    if (!name) {
      throw new Error(`Unknown chain ID: ${nameOrChainId}. Supported: ${Object.keys(CHAIN_ID_TO_NETWORK).join(", ")}`);
    }
    return NETWORKS[name];
  }

  if (nameOrChainId.startsWith("eip155:")) {
    const name = CAIP2_TO_NETWORK[nameOrChainId];
    if (!name) {
      throw new Error(`Unknown CAIP-2 network: ${nameOrChainId}. Supported: ${Object.keys(CAIP2_TO_NETWORK).join(", ")}`);
    }
    return NETWORKS[name];
  }

  const network = NETWORKS[nameOrChainId.toLowerCase()];
  if (!network) {
    throw new Error(`Unknown network: ${nameOrChainId}. Supported: ${Object.keys(NETWORKS).join(", ")}`);
  }
  return network;
}

export function getDefaultNetwork(): NetworkConfig {
  const networkKeys = Object.keys(NETWORKS);
  if (networkKeys.length === 0) {
    throw new Error("Networks not initialized. Call initializeNetworks() first.");
  }

  const envNetwork = process.env.TENEO_NETWORK;
  if (envNetwork) {
    try {
      return getNetwork(envNetwork);
    } catch {
      console.warn(`Invalid TENEO_NETWORK: ${envNetwork}, using default`);
    }
  }

  // Prefer "peaq" if available, otherwise use first available network
  if (NETWORKS["peaq"]) {
    return NETWORKS["peaq"];
  }
  return NETWORKS[networkKeys[0]];
}

export function createChainDefinition(network: NetworkConfig): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    network: network.name.toLowerCase().replace(/\s+/g, "-"),
    nativeCurrency: {
      decimals: 18,
      name: network.name.split(" ")[0],
      symbol: network.name === "PEAQ Mainnet" ? "PEAQ" : network.name === "Avalanche Mainnet" ? "AVAX" : network.name === "X Layer Mainnet" ? "OKB" : "ETH"
    },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
      public: { http: [network.rpcUrl] }
    }
  });
}

export function isNetworkSupported(nameOrChainId: string | number): boolean {
  try {
    getNetwork(nameOrChainId);
    return true;
  } catch {
    return false;
  }
}

export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS);
}
