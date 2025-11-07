/**
 * Tests for SecurePrivateKey class
 * Verifies secure encryption, decryption, memory cleanup, and integration with viem
 */

import { SecurePrivateKey } from "./secure-private-key";
import { privateKeyToAccount } from "viem/accounts";

describe("SecurePrivateKey", () => {
  // Test private key (do NOT use in production)
  const testPrivateKey = "0x1234567890123456789012345678901234567890123456789012345678901234";

  describe("constructor", () => {
    it("should create instance with valid private key", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      expect(secureKey).toBeInstanceOf(SecurePrivateKey);
      expect(secureKey.isDestroyed()).toBe(false);
      secureKey.destroy();
    });

    it("should throw error with empty private key", () => {
      expect(() => new SecurePrivateKey("")).toThrow("Private key must be a non-empty string");
    });

    it("should throw error with null private key", () => {
      expect(() => new SecurePrivateKey(null as any)).toThrow(
        "Private key must be a non-empty string"
      );
    });

    it("should throw error with undefined private key", () => {
      expect(() => new SecurePrivateKey(undefined as any)).toThrow(
        "Private key must be a non-empty string"
      );
    });

    it("should throw error with non-string private key", () => {
      expect(() => new SecurePrivateKey(123 as any)).toThrow(
        "Private key must be a non-empty string"
      );
    });
  });

  describe("use()", () => {
    it("should decrypt and pass key to callback", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const result = secureKey.use((key) => {
        expect(key).toBe(testPrivateKey);
        return "success";
      });

      expect(result).toBe("success");
      secureKey.destroy();
    });

    it("should return callback result", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const result = secureKey.use((key) => {
        return { key: key.substring(0, 10), length: key.length };
      });

      expect(result).toEqual({
        key: testPrivateKey.substring(0, 10),
        length: testPrivateKey.length
      });
      secureKey.destroy();
    });

    it("should work with async callbacks", async () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const result = await secureKey.use(async (key) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return key.length;
      });

      expect(result).toBe(testPrivateKey.length);
      secureKey.destroy();
    });

    it("should allow multiple uses", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const result1 = secureKey.use((key) => key.length);
      const result2 = secureKey.use((key) => key.substring(0, 5));
      const result3 = secureKey.use((key) => key);

      expect(result1).toBe(testPrivateKey.length);
      expect(result2).toBe(testPrivateKey.substring(0, 5));
      expect(result3).toBe(testPrivateKey);

      secureKey.destroy();
    });

    it("should throw if key has been destroyed", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      secureKey.destroy();

      expect(() => {
        secureKey.use((key) => key);
      }).toThrow("SecurePrivateKey has been destroyed and can no longer be used");
    });

    it("should propagate errors from callback", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      expect(() => {
        secureKey.use((key) => {
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      secureKey.destroy();
    });

    it("should clean up even if callback throws", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      try {
        secureKey.use((key) => {
          throw new Error("Test error");
        });
      } catch (error) {
        // Expected
      }

      // Key should still be usable after error
      const result = secureKey.use((key) => key.length);
      expect(result).toBe(testPrivateKey.length);

      secureKey.destroy();
    });
  });

  describe("destroy()", () => {
    it("should mark instance as destroyed", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      expect(secureKey.isDestroyed()).toBe(false);

      secureKey.destroy();
      expect(secureKey.isDestroyed()).toBe(true);
    });

    it("should be idempotent (safe to call multiple times)", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      secureKey.destroy();
      secureKey.destroy();
      secureKey.destroy();

      expect(secureKey.isDestroyed()).toBe(true);
    });

    it("should prevent further use after destruction", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      secureKey.destroy();

      expect(() => {
        secureKey.use((key) => key);
      }).toThrow("SecurePrivateKey has been destroyed");
    });
  });

  describe("isDestroyed()", () => {
    it("should return false for new instance", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      expect(secureKey.isDestroyed()).toBe(false);
      secureKey.destroy();
    });

    it("should return true after destruction", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);
      secureKey.destroy();
      expect(secureKey.isDestroyed()).toBe(true);
    });
  });

  describe("encryption/decryption", () => {
    it("should correctly encrypt and decrypt private key", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const decrypted = secureKey.use((key) => key);
      expect(decrypted).toBe(testPrivateKey);

      secureKey.destroy();
    });

    it("should handle keys with special characters", () => {
      const specialKey = "0xABCDEF123456!@#$%^&*()_+-=[]{}|;:,.<>?";
      const secureKey = new SecurePrivateKey(specialKey);

      const decrypted = secureKey.use((key) => key);
      expect(decrypted).toBe(specialKey);

      secureKey.destroy();
    });

    it("should handle very long keys", () => {
      const longKey = "0x" + "a".repeat(1000);
      const secureKey = new SecurePrivateKey(longKey);

      const decrypted = secureKey.use((key) => key);
      expect(decrypted).toBe(longKey);

      secureKey.destroy();
    });

    it("should produce different encrypted data for same key (random IV)", () => {
      const secureKey1 = new SecurePrivateKey(testPrivateKey);
      const secureKey2 = new SecurePrivateKey(testPrivateKey);

      // Access private encrypted buffers via any to verify they're different
      const encrypted1 = (secureKey1 as any).encrypted;
      const encrypted2 = (secureKey2 as any).encrypted;

      // Encrypted data should be different due to random IV
      expect(Buffer.compare(encrypted1, encrypted2)).not.toBe(0);

      // But decrypted should be the same
      const decrypted1 = secureKey1.use((key) => key);
      const decrypted2 = secureKey2.use((key) => key);

      expect(decrypted1).toBe(testPrivateKey);
      expect(decrypted2).toBe(testPrivateKey);

      secureKey1.destroy();
      secureKey2.destroy();
    });
  });

  describe("integration with viem", () => {
    it("should work with privateKeyToAccount", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const account = secureKey.use((key) => {
        return privateKeyToAccount(key as `0x${string}`);
      });

      expect(account).toBeDefined();
      expect(account.address).toBeDefined();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

      secureKey.destroy();
    });

    it("should allow signing messages with account created from secure key", async () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const account = secureKey.use((key) => {
        return privateKeyToAccount(key as `0x${string}`);
      });

      const message = "Hello, Teneo!";
      const signature = await account.signMessage({ message });

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signature.length).toBeGreaterThan(100);

      secureKey.destroy();
    });

    it("should create consistent account address across multiple uses", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const address1 = secureKey.use((key) => {
        return privateKeyToAccount(key as `0x${string}`).address;
      });

      const address2 = secureKey.use((key) => {
        return privateKeyToAccount(key as `0x${string}`).address;
      });

      expect(address1).toBe(address2);

      secureKey.destroy();
    });
  });

  describe("security properties", () => {
    it("should not expose private key in toString()", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const stringified = String(secureKey);
      expect(stringified).not.toContain(testPrivateKey);
      expect(stringified).not.toContain(testPrivateKey.substring(5, 20));

      secureKey.destroy();
    });

    it("should not expose private key in JSON.stringify()", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      const jsonString = JSON.stringify(secureKey);
      expect(jsonString).not.toContain(testPrivateKey);
      expect(jsonString).not.toContain(testPrivateKey.substring(5, 20));

      secureKey.destroy();
    });

    it("should not expose private key when inspecting object", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      // Try to access private properties (they're still accessible via 'any' but not exposed)
      const keys = Object.keys(secureKey);
      const values = Object.values(secureKey);

      // Should not contain the plaintext key
      const allValues = JSON.stringify(values);
      expect(allValues).not.toContain(testPrivateKey);

      secureKey.destroy();
    });

    it("should store key encrypted in memory", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      // Access encrypted buffer via any
      const encrypted = (secureKey as any).encrypted as Buffer;

      // Encrypted data should not contain the plaintext key
      const encryptedString = encrypted.toString("utf8");
      expect(encryptedString).not.toContain(testPrivateKey);
      expect(encryptedString).not.toContain("1234567890");

      secureKey.destroy();
    });
  });

  describe("memory cleanup", () => {
    it("should zero out encryption key on destroy", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      // Get reference to encryption key before destroy
      const encryptionKey = (secureKey as any).encryptionKey as Buffer;
      const originalKeyData = Buffer.from(encryptionKey);

      expect(originalKeyData.some((byte) => byte !== 0)).toBe(true);

      secureKey.destroy();

      // After destroy, encryption key should be zeroed
      expect(encryptionKey.every((byte) => byte === 0)).toBe(true);
    });

    it("should zero out encrypted buffer on destroy", () => {
      const secureKey = new SecurePrivateKey(testPrivateKey);

      // Get reference to encrypted buffer before destroy
      const encrypted = (secureKey as any).encrypted as Buffer;
      const originalEncryptedData = Buffer.from(encrypted);

      expect(originalEncryptedData.some((byte) => byte !== 0)).toBe(true);

      secureKey.destroy();

      // After destroy, encrypted buffer should be zeroed
      expect(encrypted.every((byte) => byte === 0)).toBe(true);
    });
  });
});
