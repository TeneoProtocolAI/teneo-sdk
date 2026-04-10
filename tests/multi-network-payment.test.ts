/**
 * Multi-Network Payment Tests
 *
 * Tests PaymentClient across PEAQ, Base, and Avalanche networks.
 * Uses a test private key to create actual payment headers.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { PaymentClient } from "../src/payments/payment-client";
import {
  getNetwork,
  NETWORKS,
  setNetworkConfigUrl,
  fetchNetworkConfigs
} from "../src/payments/networks";
import { SecurePrivateKey } from "../src/utils/secure-private-key";
import { privateKeyToAccount } from "viem/accounts";

// Test private key (Hardhat default test account #0 - DO NOT use for real funds)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_RECIPIENT = "0x1234567890123456789012345678901234567890";

// Mock network data
const mockNetworkData = {
  networks: {
    peaq: {
      chainId: 3338,
      name: "PEAQ Mainnet",
      caip2: "eip155:3338",
      rpcUrl: "https://peaq.network/rpc",
      usdcContract: "0xbbA60da06c2c5424f03f7434542280FCAd453d10",
      settlementRouter: "0xCD57f4596f70b18a0fd0c42daa4F3066d3adc8d4",
      transferHook: "0xf45FA7713a58eBd0C353186F9e49A7C39a0eD34E",
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
      settlementRouter: "0x73fc659Cd5494E69852bE8D9D23FE05Aab14b29B",
      transferHook: "0x081258287F692D61575387ee2a4075f34dd7Aef7",
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
      settlementRouter: "0xF38709cFd3f89734c231dd8E59Ff1d44caCddEe8",
      transferHook: "0x6D21298950dC58a984664B12Cdf4DeBA143889aa",
      eip712: {
        name: "USD Coin",
        version: "2"
      }
    }
  }
};

describe("Multi-Network Payment Tests", () => {
  let secureKey: SecurePrivateKey;
  let walletAddress: string;

  beforeAll(async () => {
    // Mock global fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockNetworkData)
      } as Response)
    );

    // Initialize networks before tests
    setNetworkConfigUrl("https://backend.test.com/ws");
    await fetchNetworkConfigs();

    secureKey = new SecurePrivateKey(TEST_PRIVATE_KEY);
    const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
    walletAddress = account.address;
    console.log(`Test wallet address: ${walletAddress}`);
  });

  describe("Network Configuration Verification", () => {
    it("should have correct PEAQ configuration", () => {
      const peaq = getNetwork("peaq");
      expect(peaq.chainId).toBe(3338);
      expect(peaq.settlementRouter).toBe("0xCD57f4596f70b18a0fd0c42daa4F3066d3adc8d4");
      expect(peaq.transferHook).toBe("0xf45FA7713a58eBd0C353186F9e49A7C39a0eD34E");
      expect(peaq.usdcContract).toBe("0xbbA60da06c2c5424f03f7434542280FCAd453d10");
      console.log("PEAQ:", peaq);
    });

    it("should have correct Base configuration", () => {
      const base = getNetwork("base");
      expect(base.chainId).toBe(8453);
      expect(base.settlementRouter).toBe("0x73fc659Cd5494E69852bE8D9D23FE05Aab14b29B");
      expect(base.transferHook).toBe("0x081258287F692D61575387ee2a4075f34dd7Aef7");
      expect(base.usdcContract).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      console.log("Base:", base);
    });

    it("should have correct Avalanche configuration", () => {
      const avalanche = getNetwork("avalanche");
      expect(avalanche.chainId).toBe(43114);
      expect(avalanche.settlementRouter).toBe("0xF38709cFd3f89734c231dd8E59Ff1d44caCddEe8");
      expect(avalanche.transferHook).toBe("0x6D21298950dC58a984664B12Cdf4DeBA143889aa");
      expect(avalanche.usdcContract).toBe("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E");
      console.log("Avalanche:", avalanche);
    });
  });

  describe("PaymentClient on PEAQ", () => {
    let client: PaymentClient;

    beforeAll(() => {
      client = new PaymentClient(secureKey, walletAddress, {
        network: "peaq"
      });
    });

    it("should create client with correct network", () => {
      expect(client.network.chainId).toBe(3338);
      expect(client.network.name).toBe("PEAQ Mainnet");
      expect(client.caip2).toBe("eip155:3338");
    });

    it("should create payment header for PEAQ", async () => {
      const header = await client.createPaymentHeader(
        1000000, // 1 USDC
        TEST_RECIPIENT,
        "https://example.com/x402"
      );

      expect(header).toBeDefined();
      expect(typeof header).toBe("string");

      // Decode and verify header structure
      const decoded = JSON.parse(Buffer.from(header, "base64").toString());
      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepted.network).toBe("eip155:3338");
      expect(decoded.accepted.asset).toBe("0xbbA60da06c2c5424f03f7434542280FCAd453d10");
      expect(decoded.accepted.amount).toBe("1000000");
      expect(decoded.payload.authorization.from).toBe(walletAddress);
      // Authorization "to" is the settlement router, not the recipient
      expect(decoded.payload.authorization.to).toBe("0xCD57f4596f70b18a0fd0c42daa4F3066d3adc8d4");
      // Final recipient is in accepted.payTo
      expect(decoded.accepted.payTo).toBe(TEST_RECIPIENT);
      console.log("PEAQ Payment Header:", JSON.stringify(decoded, null, 2));
    });
  });

  describe("PaymentClient on Base", () => {
    let client: PaymentClient;

    beforeAll(() => {
      client = new PaymentClient(secureKey, walletAddress, {
        network: "base"
      });
    });

    it("should create client with correct network", () => {
      expect(client.network.chainId).toBe(8453);
      expect(client.network.name).toBe("Base Mainnet");
      expect(client.caip2).toBe("eip155:8453");
    });

    it("should create payment header for Base", async () => {
      const header = await client.createPaymentHeader(
        500000, // 0.5 USDC
        TEST_RECIPIENT,
        "https://example.com/x402"
      );

      expect(header).toBeDefined();

      const decoded = JSON.parse(Buffer.from(header, "base64").toString());
      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepted.network).toBe("eip155:8453");
      expect(decoded.accepted.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(decoded.accepted.amount).toBe("500000");
      expect(decoded.accepted.extra.name).toBe("USD Coin"); // Base USDC EIP-712 name
      console.log("Base Payment Header:", JSON.stringify(decoded, null, 2));
    });

    it("should use correct EIP-712 domain for Base USDC", async () => {
      const header = await client.createPaymentHeader(
        100000,
        TEST_RECIPIENT,
        "https://example.com/x402"
      );
      const decoded = JSON.parse(Buffer.from(header, "base64").toString());

      // Base USDC uses "USD Coin" as the EIP-712 name
      expect(decoded.accepted.extra.name).toBe("USD Coin");
      expect(decoded.accepted.extra.version).toBe("2");
    });
  });

  describe("PaymentClient on Avalanche", () => {
    let client: PaymentClient;

    beforeAll(() => {
      client = new PaymentClient(secureKey, walletAddress, {
        network: "avalanche"
      });
    });

    it("should create client with correct network", () => {
      expect(client.network.chainId).toBe(43114);
      expect(client.network.name).toBe("Avalanche Mainnet");
      expect(client.caip2).toBe("eip155:43114");
    });

    it("should create payment header for Avalanche", async () => {
      const header = await client.createPaymentHeader(
        2000000, // 2 USDC
        TEST_RECIPIENT,
        "https://example.com/x402"
      );

      expect(header).toBeDefined();

      const decoded = JSON.parse(Buffer.from(header, "base64").toString());
      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepted.network).toBe("eip155:43114");
      expect(decoded.accepted.asset).toBe("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E");
      expect(decoded.accepted.amount).toBe("2000000");
      console.log("Avalanche Payment Header:", JSON.stringify(decoded, null, 2));
    });
  });

  describe("Network Selection by Chain ID", () => {
    it("should create client for PEAQ by chain ID 3338", () => {
      const client = new PaymentClient(secureKey, walletAddress, {
        networkChainId: 3338
      });
      expect(client.network.name).toBe("PEAQ Mainnet");
    });

    it("should create client for Base by chain ID 8453", () => {
      const client = new PaymentClient(secureKey, walletAddress, {
        networkChainId: 8453
      });
      expect(client.network.name).toBe("Base Mainnet");
    });

    it("should create client for Avalanche by chain ID 43114", () => {
      const client = new PaymentClient(secureKey, walletAddress, {
        networkChainId: 43114
      });
      expect(client.network.name).toBe("Avalanche Mainnet");
    });
  });

  describe("Per-Request Network Override", () => {
    it("should allow network override in createPaymentHeader", async () => {
      // Create client for PEAQ
      const client = new PaymentClient(secureKey, walletAddress, {
        network: "peaq"
      });
      expect(client.network.chainId).toBe(3338);

      // But create payment for Base
      const header = await client.createPaymentHeader(
        100000,
        TEST_RECIPIENT,
        "https://example.com/x402",
        "base" // Override to Base
      );

      const decoded = JSON.parse(Buffer.from(header, "base64").toString());
      expect(decoded.accepted.network).toBe("eip155:8453"); // Should be Base
      expect(decoded.accepted.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // Base USDC
    });

    it("should allow chain ID override in createPaymentHeader", async () => {
      const client = new PaymentClient(secureKey, walletAddress, {
        network: "peaq"
      });

      // Override by chain ID
      const header = await client.createPaymentHeader(
        100000,
        TEST_RECIPIENT,
        "https://example.com/x402",
        43114 // Override to Avalanche by chain ID
      );

      const decoded = JSON.parse(Buffer.from(header, "base64").toString());
      expect(decoded.accepted.network).toBe("eip155:43114"); // Should be Avalanche
    });
  });

  describe("All Networks Summary", () => {
    it("should print all network configurations", () => {
      console.log("\n=== All Supported Networks ===\n");

      for (const [name, config] of Object.entries(NETWORKS)) {
        console.log(`${name.toUpperCase()}:`);
        console.log(`  Chain ID: ${config.chainId}`);
        console.log(`  CAIP-2: ${config.caip2}`);
        console.log(`  USDC: ${config.usdcContract}`);
        console.log(`  SettlementRouter: ${config.settlementRouter}`);
        console.log(`  TransferHook: ${config.transferHook}`);
        console.log(`  EIP-712: ${config.eip712.name} v${config.eip712.version}`);
        console.log("");
      }
    });
  });
});
