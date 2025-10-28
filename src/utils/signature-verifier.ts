/**
 * Signature Verifier for Message Authentication
 * Provides cryptographic verification of message signatures using Ethereum ECDSA
 */

import { verifyMessage, hashMessage, type Address } from "viem";
import { BaseMessage, MessageType } from "../types";

/**
 * Options for signature verification
 */
export interface SignatureVerificationOptions {
  /** Whitelist of trusted agent addresses (empty = allow all) */
  trustedAddresses?: Address[];

  /** Message types that require signatures */
  requireSignaturesFor?: MessageType[];

  /** Reject messages with missing signatures (vs just warn) */
  strictMode?: boolean;
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  valid: boolean;

  /** Recovered address from signature (if signature present) */
  recoveredAddress?: Address;

  /** Reason for failure (if not valid) */
  reason?: string;

  /** Whether signature was missing */
  signatureMissing: boolean;

  /** Whether address is in trusted whitelist (if whitelist configured) */
  isTrusted?: boolean;
}

/**
 * Signature verifier for authenticating message origins
 * Prevents spoofing attacks by verifying Ethereum signatures on messages
 *
 * @example
 * ```typescript
 * const verifier = new SignatureVerifier({
 *   trustedAddresses: ['0x123...', '0x456...'],
 *   requireSignaturesFor: ['task_response', 'agent_selected'],
 *   strictMode: true
 * });
 *
 * const result = await verifier.verify(message);
 * if (!result.valid) {
 *   console.log(`Verification failed: ${result.reason}`);
 * }
 * ```
 */
export class SignatureVerifier {
  private readonly options: Required<SignatureVerificationOptions>;

  /**
   * Creates a new signature verifier
   *
   * @param options - Verification options
   *
   * @example
   * ```typescript
   * const verifier = new SignatureVerifier({
   *   trustedAddresses: ['0x123...'],
   *   requireSignaturesFor: ['task_response'],
   *   strictMode: false
   * });
   * ```
   */
  constructor(options: SignatureVerificationOptions = {}) {
    this.options = {
      trustedAddresses: options.trustedAddresses || [],
      requireSignaturesFor: options.requireSignaturesFor || [],
      strictMode: options.strictMode !== undefined ? options.strictMode : false
    };
  }

  /**
   * Verify a message's signature
   *
   * @param message - The message to verify
   * @returns Verification result with validity and recovered address
   *
   * @example
   * ```typescript
   * const result = await verifier.verify(message);
   * if (result.valid) {
   *   console.log(`Valid signature from ${result.recoveredAddress}`);
   * } else {
   *   console.log(`Invalid: ${result.reason}`);
   * }
   * ```
   */
  public async verify(message: BaseMessage): Promise<VerificationResult> {
    // Check if signature is present
    if (!message.signature) {
      const isRequired = this.isSignatureRequired(message.type);

      return {
        valid: !isRequired && !this.options.strictMode,
        signatureMissing: true,
        reason: isRequired
          ? `Signature required for message type '${message.type}'`
          : "Signature missing but not required"
      };
    }

    // Extract signable content (excludes signature and publicKey fields)
    const signableContent = this.getSignableContent(message);

    // Create canonical message hash
    const messageHash = this.createMessageHash(signableContent);

    try {
      // Determine which address to verify against
      const addressToVerify = await this.getVerificationAddress(message);

      if (!addressToVerify) {
        return {
          valid: false,
          signatureMissing: false,
          reason: "No address available for verification (missing publicKey and from fields)"
        };
      }

      // Verify signature using viem
      const isValid = await verifyMessage({
        address: addressToVerify,
        message: messageHash,
        signature: message.signature as `0x${string}`
      });

      if (!isValid) {
        return {
          valid: false,
          recoveredAddress: addressToVerify,
          signatureMissing: false,
          reason: "Signature verification failed - signature does not match message content"
        };
      }

      // Check if address is trusted (if whitelist configured)
      const isTrusted = this.isTrustedAddress(addressToVerify);

      // If whitelist is configured and address is not trusted, reject
      if (this.options.trustedAddresses.length > 0 && !isTrusted) {
        return {
          valid: false,
          recoveredAddress: addressToVerify,
          signatureMissing: false,
          isTrusted: false,
          reason: `Address ${addressToVerify} is not in trusted whitelist`
        };
      }

      return {
        valid: true,
        recoveredAddress: addressToVerify,
        signatureMissing: false,
        isTrusted
      };
    } catch (error) {
      return {
        valid: false,
        signatureMissing: false,
        reason: `Signature verification error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a canonical hash of message content for signing
   *
   * @param content - The signable content object
   * @returns Message hash string
   */
  public createMessageHash(content: object): string {
    // Create canonical JSON string (sorted keys for consistency)
    const canonical = JSON.stringify(content, Object.keys(content).sort());

    // Use viem's hashMessage for Ethereum-compatible hashing
    return hashMessage(canonical);
  }

  /**
   * Extract signable content from message
   * Excludes signature and publicKey fields to prevent circular dependency
   *
   * @param message - The message to extract content from
   * @returns Object containing signable fields
   */
  public getSignableContent(message: BaseMessage): object {
    const { signature, publicKey, id, ...signableContent } = message;

    // Include only defined fields for consistent hashing
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(signableContent)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Check if signature is required for a message type
   *
   * @param messageType - The type of message
   * @returns True if signature is required
   */
  public isSignatureRequired(messageType: MessageType): boolean {
    return this.options.requireSignaturesFor.includes(messageType);
  }

  /**
   * Check if an address is in the trusted whitelist
   *
   * @param address - The address to check
   * @returns True if address is trusted (or no whitelist configured)
   */
  public isTrustedAddress(address: Address): boolean {
    if (this.options.trustedAddresses.length === 0) {
      return true; // No whitelist = trust all
    }

    return this.options.trustedAddresses.some(
      (trusted) => trusted.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * Get the address to verify against
   * Tries publicKey first, falls back to 'from' field
   *
   * @param message - The message to get address from
   * @returns Address to verify, or undefined if none available
   */
  private async getVerificationAddress(message: BaseMessage): Promise<Address | undefined> {
    // If message includes publicKey, derive address from it
    if (message.publicKey) {
      // publicKey should be an Ethereum address already
      // If it's actually a public key, we'd need to derive the address
      // For now, assume publicKey field contains the address
      return message.publicKey as Address;
    }

    // Fall back to 'from' field if it looks like an address
    if (message.from && message.from.startsWith("0x") && message.from.length === 42) {
      return message.from as Address;
    }

    return undefined;
  }

  /**
   * Update verification options
   *
   * @param options - New options (merged with existing)
   *
   * @example
   * ```typescript
   * verifier.updateOptions({
   *   trustedAddresses: ['0x789...'],
   *   strictMode: true
   * });
   * ```
   */
  public updateOptions(options: Partial<SignatureVerificationOptions>): void {
    if (options.trustedAddresses !== undefined) {
      this.options.trustedAddresses = options.trustedAddresses;
    }
    if (options.requireSignaturesFor !== undefined) {
      this.options.requireSignaturesFor = options.requireSignaturesFor;
    }
    if (options.strictMode !== undefined) {
      this.options.strictMode = options.strictMode;
    }
  }

  /**
   * Get current verification options
   *
   * @returns Copy of current options
   */
  public getOptions(): SignatureVerificationOptions {
    return { ...this.options };
  }
}
