/**
 * Tests for Signature Verifier
 */

import { describe, it, expect, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { SignatureVerifier } from "./signature-verifier";
import { BaseMessage, createUserMessage } from "../types";

describe("SignatureVerifier", () => {
  // Test accounts
  const testAccount1 = privateKeyToAccount(
    "0x1234567890123456789012345678901234567890123456789012345678901234"
  );
  const testAccount2 = privateKeyToAccount(
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  );

  describe("constructor", () => {
    it("should create verifier with default options", () => {
      const verifier = new SignatureVerifier();
      const options = verifier.getOptions();

      expect(options.trustedAddresses).toEqual([]);
      expect(options.requireSignaturesFor).toEqual([]);
      expect(options.strictMode).toBe(false);
    });

    it("should create verifier with custom options", () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address],
        requireSignaturesFor: ["task_response", "agent_selected"],
        strictMode: true
      });

      const options = verifier.getOptions();
      expect(options.trustedAddresses).toEqual([testAccount1.address]);
      expect(options.requireSignaturesFor).toEqual(["task_response", "agent_selected"]);
      expect(options.strictMode).toBe(true);
    });
  });

  describe("getSignableContent", () => {
    it("should exclude signature and publicKey fields", () => {
      const verifier = new SignatureVerifier();
      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        from: "agent1",
        signature: "0xsignature",
        publicKey: "0xpublickey",
        timestamp: "2024-01-01T00:00:00Z"
      };

      const signable = verifier.getSignableContent(message);

      expect(signable).not.toHaveProperty("signature");
      expect(signable).not.toHaveProperty("publicKey");
      expect(signable).not.toHaveProperty("id");
      expect(signable).toHaveProperty("type");
      expect(signable).toHaveProperty("content");
      expect(signable).toHaveProperty("from");
    });

    it("should exclude undefined fields", () => {
      const verifier = new SignatureVerifier();
      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        from: undefined,
        room: "general"
      };

      const signable = verifier.getSignableContent(message);

      expect(signable).not.toHaveProperty("from");
      expect(signable).toHaveProperty("type");
      expect(signable).toHaveProperty("content");
      expect(signable).toHaveProperty("room");
    });
  });

  describe("createMessageHash", () => {
    it("should create consistent hashes for same content", () => {
      const verifier = new SignatureVerifier();
      const content = { type: "message", content: "Hello" };

      const hash1 = verifier.createMessageHash(content);
      const hash2 = verifier.createMessageHash(content);

      expect(hash1).toBe(hash2);
    });

    it("should create different hashes for different content", () => {
      const verifier = new SignatureVerifier();
      const content1 = { type: "message", content: "Hello" };
      const content2 = { type: "message", content: "World" };

      const hash1 = verifier.createMessageHash(content1);
      const hash2 = verifier.createMessageHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    it("should create same hash regardless of key order", () => {
      const verifier = new SignatureVerifier();
      const content1 = { type: "message", content: "Hello", from: "agent" };
      const content2 = { from: "agent", content: "Hello", type: "message" };

      const hash1 = verifier.createMessageHash(content1);
      const hash2 = verifier.createMessageHash(content2);

      expect(hash1).toBe(hash2);
    });
  });

  describe("isSignatureRequired", () => {
    it("should return false when message type not in required list", () => {
      const verifier = new SignatureVerifier({
        requireSignaturesFor: ["task_response"]
      });

      expect(verifier.isSignatureRequired("message")).toBe(false);
      expect(verifier.isSignatureRequired("ping")).toBe(false);
    });

    it("should return true when message type is in required list", () => {
      const verifier = new SignatureVerifier({
        requireSignaturesFor: ["task_response", "agent_selected"]
      });

      expect(verifier.isSignatureRequired("task_response")).toBe(true);
      expect(verifier.isSignatureRequired("agent_selected")).toBe(true);
    });

    it("should return false when no required types configured", () => {
      const verifier = new SignatureVerifier();

      expect(verifier.isSignatureRequired("task_response")).toBe(false);
      expect(verifier.isSignatureRequired("message")).toBe(false);
    });
  });

  describe("isTrustedAddress", () => {
    it("should return true when no whitelist configured", () => {
      const verifier = new SignatureVerifier();

      expect(verifier.isTrustedAddress(testAccount1.address)).toBe(true);
      expect(verifier.isTrustedAddress(testAccount2.address)).toBe(true);
    });

    it("should return true for addresses in whitelist", () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address]
      });

      expect(verifier.isTrustedAddress(testAccount1.address)).toBe(true);
    });

    it("should return false for addresses not in whitelist", () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address]
      });

      expect(verifier.isTrustedAddress(testAccount2.address)).toBe(false);
    });

    it("should be case-insensitive", () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address.toLowerCase()]
      });

      expect(verifier.isTrustedAddress(testAccount1.address.toUpperCase())).toBe(true);
    });
  });

  describe("verify - missing signature", () => {
    it("should pass when signature missing and not required", async () => {
      const verifier = new SignatureVerifier({
        strictMode: false
      });

      const message: BaseMessage = {
        type: "ping"
      };

      const result = await verifier.verify(message);

      expect(result.valid).toBe(true);
      expect(result.signatureMissing).toBe(true);
    });

    it("should fail when signature missing but required for message type", async () => {
      const verifier = new SignatureVerifier({
        requireSignaturesFor: ["task_response"]
      });

      const message: BaseMessage = {
        type: "task_response",
        content: "Result"
      };

      const result = await verifier.verify(message);

      expect(result.valid).toBe(false);
      expect(result.signatureMissing).toBe(true);
      expect(result.reason).toContain("required");
    });

    it("should fail when signature missing and strictMode enabled", async () => {
      const verifier = new SignatureVerifier({
        strictMode: true
      });

      const message: BaseMessage = {
        type: "message",
        content: "Hello"
      };

      const result = await verifier.verify(message);

      expect(result.valid).toBe(false);
      expect(result.signatureMissing).toBe(true);
    });
  });

  describe("verify - with signature", () => {
    it("should verify valid signature", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        from: "agent1",
        timestamp: "2024-01-01T00:00:00Z",
        publicKey: testAccount1.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);
      const signature = await testAccount1.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(true);
      expect(result.signatureMissing).toBe(false);
      expect(result.recoveredAddress).toBe(testAccount1.address);
    });

    it("should reject invalid signature", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        publicKey: testAccount1.address,
        signature:
          "0xinvalidsignature1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012"
      };

      const result = await verifier.verify(message);

      expect(result.valid).toBe(false);
      expect(result.signatureMissing).toBe(false);
      expect(result.reason).toContain("error");
    });

    it("should reject signature from wrong account", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        publicKey: testAccount1.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);

      // Sign with account2 but verify against account1
      const signature = await testAccount2.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not match");
    });
  });

  describe("verify - whitelist", () => {
    it("should accept message from trusted address", async () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address]
      });

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        publicKey: testAccount1.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);
      const signature = await testAccount1.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(true);
      expect(result.isTrusted).toBe(true);
    });

    it("should reject message from untrusted address", async () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address]
      });

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        publicKey: testAccount2.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);
      const signature = await testAccount2.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(false);
      expect(result.isTrusted).toBe(false);
      expect(result.reason).toContain("not in trusted whitelist");
    });
  });

  describe("verify - address sources", () => {
    it("should use publicKey field for verification", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        publicKey: testAccount1.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);
      const signature = await testAccount1.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(true);
      expect(result.recoveredAddress).toBe(testAccount1.address);
    });

    it("should fallback to from field if address-like", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        from: testAccount1.address
      };

      const signableContent = verifier.getSignableContent(message);
      const messageHash = verifier.createMessageHash(signableContent);
      const signature = await testAccount1.signMessage({ message: messageHash });

      const messageWithSignature: BaseMessage = {
        ...message,
        signature
      };

      const result = await verifier.verify(messageWithSignature);

      expect(result.valid).toBe(true);
      expect(result.recoveredAddress).toBe(testAccount1.address);
    });

    it("should fail if no valid address available", async () => {
      const verifier = new SignatureVerifier();

      const message: BaseMessage = {
        type: "message",
        content: "Hello",
        from: "agent-name-not-address",
        signature: "0xsignature"
      };

      const result = await verifier.verify(message);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("No address available");
    });
  });

  describe("updateOptions", () => {
    it("should update trusted addresses", () => {
      const verifier = new SignatureVerifier();

      verifier.updateOptions({
        trustedAddresses: [testAccount1.address]
      });

      const options = verifier.getOptions();
      expect(options.trustedAddresses).toEqual([testAccount1.address]);
    });

    it("should update required message types", () => {
      const verifier = new SignatureVerifier();

      verifier.updateOptions({
        requireSignaturesFor: ["task_response"]
      });

      expect(verifier.isSignatureRequired("task_response")).toBe(true);
    });

    it("should update strict mode", () => {
      const verifier = new SignatureVerifier({ strictMode: false });

      verifier.updateOptions({
        strictMode: true
      });

      const options = verifier.getOptions();
      expect(options.strictMode).toBe(true);
    });

    it("should merge with existing options", () => {
      const verifier = new SignatureVerifier({
        trustedAddresses: [testAccount1.address],
        strictMode: false
      });

      verifier.updateOptions({
        strictMode: true
      });

      const options = verifier.getOptions();
      expect(options.trustedAddresses).toEqual([testAccount1.address]);
      expect(options.strictMode).toBe(true);
    });
  });
});
