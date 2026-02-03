/**
 * Multi-Network Support Tests (v2.3.0)
 *
 * Tests for multi-network payment support including:
 * - Network configuration lookup
 * - Default network resolution
 * - PaymentClient network configuration
 * - SDKConfigBuilder network methods
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getNetwork,
  getDefaultNetwork,
  isNetworkSupported,
  getSupportedNetworks,
  NETWORKS,
  CHAIN_ID_TO_NETWORK,
  CAIP2_TO_NETWORK,
  setNetworkConfigUrl,
  fetchNetworkConfigs
} from "../src/payments/networks";
import { SDKConfigBuilder } from "../src/types/config";

// Mock fetch globally for all tests
const mockNetworkData = {
  networks: {
    peaq: {
      chainId: 3338,
      name: "PEAQ Mainnet",
      caip2: "eip155:3338",
      rpcUrl: "https://peaq.network/rpc",
      usdcContract: "0xbbA60da06c2c5424f03f7434542280FCAd453d10",
      settlementRouter: "0x0000000000000000000000000000000000000001",
      transferHook: "0x0000000000000000000000000000000000000002",
      eip712: {
        name: "USDC",
        version: "2"
      }
    },
    base: {
      chainId: 8453,
      name: "Base Mainnet",
      caip2: "eip155:8453",
      rpcUrl: "https://mainnet.base.org",
      usdcContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      settlementRouter: "0x0000000000000000000000000000000000000003",
      transferHook: "0x0000000000000000000000000000000000000004",
      eip712: {
        name: "USD Coin",
        version: "2"
      }
    },
    avalanche: {
      chainId: 43114,
      name: "Avalanche Mainnet",
      caip2: "eip155:43114",
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      usdcContract: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      settlementRouter: "0x0000000000000000000000000000000000000005",
      transferHook: "0x0000000000000000000000000000000000000006",
      eip712: {
        name: "USD Coin",
        version: "2"
      }
    }
  }
};

describe("Multi-Network Support", () => {
  beforeEach(async () => {
    // Mock global fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockNetworkData)
      } as Response)
    );

    // Initialize networks before each test
    setNetworkConfigUrl("https://backend.test.com/ws");
    await fetchNetworkConfigs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Network Configuration", () => {
    it("should have PEAQ network configured", () => {
      expect(NETWORKS.peaq).toBeDefined();
      expect(NETWORKS.peaq.chainId).toBe(3338);
      expect(NETWORKS.peaq.caip2).toBe("eip155:3338");
      expect(NETWORKS.peaq.usdcContract).toBe("0xbbA60da06c2c5424f03f7434542280FCAd453d10");
    });

    it("should have Base Mainnet configured", () => {
      expect(NETWORKS.base).toBeDefined();
      expect(NETWORKS.base.chainId).toBe(8453);
      expect(NETWORKS.base.caip2).toBe("eip155:8453");
      expect(NETWORKS.base.usdcContract).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    });

    it("should have Avalanche Mainnet configured", () => {
      expect(NETWORKS.avalanche).toBeDefined();
      expect(NETWORKS.avalanche.chainId).toBe(43114);
      expect(NETWORKS.avalanche.caip2).toBe("eip155:43114");
      expect(NETWORKS.avalanche.usdcContract).toBe("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E");
    });

    it("should have chain ID to network mapping", () => {
      expect(CHAIN_ID_TO_NETWORK[3338]).toBe("peaq");
      expect(CHAIN_ID_TO_NETWORK[8453]).toBe("base");
      expect(CHAIN_ID_TO_NETWORK[43114]).toBe("avalanche");
    });

    it("should have CAIP-2 to network mapping", () => {
      expect(CAIP2_TO_NETWORK["eip155:3338"]).toBe("peaq");
      expect(CAIP2_TO_NETWORK["eip155:8453"]).toBe("base");
      expect(CAIP2_TO_NETWORK["eip155:43114"]).toBe("avalanche");
    });
  });

  describe("getNetwork()", () => {
    it("should get network by name", () => {
      const peaq = getNetwork("peaq");
      expect(peaq.chainId).toBe(3338);

      const base = getNetwork("base");
      expect(base.chainId).toBe(8453);

      const avalanche = getNetwork("avalanche");
      expect(avalanche.chainId).toBe(43114);
    });

    it("should get network by chain ID", () => {
      const peaq = getNetwork(3338);
      expect(peaq.name).toBe("PEAQ Mainnet");

      const base = getNetwork(8453);
      expect(base.name).toBe("Base Mainnet");

      const avalanche = getNetwork(43114);
      expect(avalanche.name).toBe("Avalanche Mainnet");
    });

    it("should get network by CAIP-2 identifier", () => {
      const peaq = getNetwork("eip155:3338");
      expect(peaq.name).toBe("PEAQ Mainnet");

      const base = getNetwork("eip155:8453");
      expect(base.name).toBe("Base Mainnet");

      const avalanche = getNetwork("eip155:43114");
      expect(avalanche.name).toBe("Avalanche Mainnet");
    });

    it("should throw for unknown network name", () => {
      expect(() => getNetwork("unknown")).toThrow("Unknown network: unknown");
    });

    it("should throw for unknown chain ID", () => {
      expect(() => getNetwork(99999)).toThrow("Unknown chain ID: 99999");
    });

    it("should throw for unknown CAIP-2", () => {
      expect(() => getNetwork("eip155:99999")).toThrow("Unknown CAIP-2 network: eip155:99999");
    });

    it("should be case-insensitive for network names", () => {
      const peaqLower = getNetwork("peaq");
      const peaqUpper = getNetwork("PEAQ");
      expect(peaqLower.chainId).toBe(peaqUpper.chainId);
    });
  });

  describe("getDefaultNetwork()", () => {
    const originalEnv = process.env.TENEO_NETWORK;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.TENEO_NETWORK;
      } else {
        process.env.TENEO_NETWORK = originalEnv;
      }
    });

    it("should return PEAQ as default when no env var set", () => {
      delete process.env.TENEO_NETWORK;
      const network = getDefaultNetwork();
      expect(network.name).toBe("PEAQ Mainnet");
    });

    it("should use TENEO_NETWORK env var when set", () => {
      process.env.TENEO_NETWORK = "base";
      const network = getDefaultNetwork();
      expect(network.name).toBe("Base Mainnet");
    });

    it("should fall back to PEAQ when env var is invalid", () => {
      process.env.TENEO_NETWORK = "invalid-network";
      // Mock console.warn to avoid test output noise
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const network = getDefaultNetwork();
      expect(network.name).toBe("PEAQ Mainnet");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("isNetworkSupported()", () => {
    it("should return true for supported networks by name", () => {
      expect(isNetworkSupported("peaq")).toBe(true);
      expect(isNetworkSupported("base")).toBe(true);
      expect(isNetworkSupported("avalanche")).toBe(true);
    });

    it("should return true for supported networks by chain ID", () => {
      expect(isNetworkSupported(3338)).toBe(true);
      expect(isNetworkSupported(8453)).toBe(true);
      expect(isNetworkSupported(43114)).toBe(true);
    });

    it("should return true for supported networks by CAIP-2", () => {
      expect(isNetworkSupported("eip155:3338")).toBe(true);
      expect(isNetworkSupported("eip155:8453")).toBe(true);
      expect(isNetworkSupported("eip155:43114")).toBe(true);
    });

    it("should return false for unsupported networks", () => {
      expect(isNetworkSupported("unknown")).toBe(false);
      expect(isNetworkSupported(99999)).toBe(false);
      expect(isNetworkSupported("eip155:99999")).toBe(false);
    });
  });

  describe("getSupportedNetworks()", () => {
    it("should return all supported network names", () => {
      const networks = getSupportedNetworks();
      expect(networks).toContain("peaq");
      expect(networks).toContain("base");
      expect(networks).toContain("avalanche");
    });
  });

  describe("SDKConfigBuilder Network Methods", () => {
    it("should support withNetwork() method", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withNetwork("base")
        .build();

      expect(config.network).toBe("base");
    });

    it("should support withNetworkChainId() method", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withNetworkChainId(8453)
        .build();

      expect(config.networkChainId).toBe(8453);
    });

    it("should support both network and networkChainId together", () => {
      const config = new SDKConfigBuilder()
        .withWebSocketUrl("wss://example.com/ws")
        .withNetwork("base")
        .withNetworkChainId(43114)
        .build();

      expect(config.network).toBe("base");
      expect(config.networkChainId).toBe(43114);
    });
  });

  describe("Network EIP-712 Parameters", () => {
    it("should have correct EIP-712 name for PEAQ USDC", () => {
      const peaq = getNetwork("peaq");
      expect(peaq.eip712.name).toBe("USDC");
      expect(peaq.eip712.version).toBe("2");
    });

    it("should have correct EIP-712 name for Base USDC", () => {
      const base = getNetwork("base");
      expect(base.eip712.name).toBe("USD Coin");
      expect(base.eip712.version).toBe("2");
    });

    it("should have correct EIP-712 name for Avalanche USDC", () => {
      const avalanche = getNetwork("avalanche");
      expect(avalanche.eip712.name).toBe("USD Coin");
      expect(avalanche.eip712.version).toBe("2");
    });
  });
});
