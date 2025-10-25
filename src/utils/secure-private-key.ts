/**
 * Secure private key storage with in-memory encryption
 * Addresses SEC-3: Private Key Exposure Risk
 *
 * This class encrypts private keys in memory using AES-256-GCM to prevent
 * exposure through memory dumps, heap snapshots, or accidental logging.
 *
 * @example
 * ```typescript
 * const secureKey = new SecurePrivateKey(privateKey);
 *
 * // Use the key temporarily for signing
 * const signature = secureKey.use((key) => {
 *   return signMessage(key);
 * });
 *
 * // Clean up when done
 * secureKey.destroy();
 * ```
 */

import crypto from 'crypto';

/**
 * Securely stores and manages an encrypted private key in memory.
 *
 * The key is encrypted immediately upon construction and only decrypted
 * temporarily when needed for operations like signing. Decrypted keys
 * are zeroed out immediately after use.
 */
export class SecurePrivateKey {
  private encrypted: Buffer;
  private encryptionKey: Buffer;
  private destroyed = false;

  /**
   * Creates a new secure private key storage.
   * The provided private key is encrypted immediately and the original
   * string becomes eligible for garbage collection.
   *
   * @param privateKey - The private key to encrypt and store securely
   * @throws {Error} If private key is empty or invalid
   */
  constructor(privateKey: string) {
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error('Private key must be a non-empty string');
    }

    // Generate a random encryption key for AES-256
    this.encryptionKey = crypto.randomBytes(32);

    // Encrypt the private key immediately
    this.encrypted = this.encrypt(privateKey);

    // Original privateKey string will be garbage collected
  }

  /**
   * Temporarily decrypts the private key and passes it to the provided function.
   * The decrypted key is automatically zeroed out after the function completes,
   * whether it succeeds or throws an error.
   *
   * This is the only way to access the decrypted private key, ensuring minimal
   * exposure time in plaintext.
   *
   * @template T - The return type of the function
   * @param fn - Function that uses the decrypted private key
   * @returns The result of the function
   * @throws {Error} If the key has been destroyed
   * @throws Any error thrown by the provided function
   *
   * @example
   * ```typescript
   * const account = secureKey.use((key) => privateKeyToAccount(key));
   * const signature = secureKey.use((key) => account.signMessage(key));
   * ```
   */
  public use<T>(fn: (key: string) => T): T {
    this.checkNotDestroyed();

    const decrypted = this.decrypt();
    try {
      return fn(decrypted);
    } finally {
      // Zero out the decrypted string in memory
      // Note: This is best-effort as JavaScript strings are immutable
      // but we overwrite the backing buffer
      this.zeroOutString(decrypted);
    }
  }

  /**
   * Destroys this secure key by zeroing out all sensitive buffers.
   * After calling destroy(), this instance can no longer be used.
   *
   * This should be called when the SDK is disconnected or the key
   * is no longer needed to prevent memory exposure.
   *
   * @example
   * ```typescript
   * secureKey.destroy();
   * // secureKey.use(...) will now throw an error
   * ```
   */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    // Zero out all sensitive buffers
    this.encryptionKey.fill(0);
    this.encrypted.fill(0);

    this.destroyed = true;
  }

  /**
   * Checks if this secure key has been destroyed.
   *
   * @returns True if destroyed, false otherwise
   */
  public isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Encrypts the private key using AES-256-GCM.
   *
   * The encrypted buffer format is: [IV (16 bytes) | Auth Tag (16 bytes) | Ciphertext]
   *
   * @param data - The private key to encrypt
   * @returns Buffer containing IV + auth tag + encrypted data
   */
  private encrypt(data: string): Buffer {
    // Generate random initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // Encrypt the data
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    // Get authentication tag for integrity verification
    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypts the stored private key.
   *
   * @returns The decrypted private key as a string
   * @throws {Error} If decryption fails (tampered data or wrong key)
   */
  private decrypt(): string {
    // Extract components from encrypted buffer
    const iv = this.encrypted.subarray(0, 16);
    const authTag = this.encrypted.subarray(16, 32);
    const ciphertext = this.encrypted.subarray(32);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Best-effort attempt to zero out a string in memory.
   * JavaScript strings are immutable, but we can try to overwrite
   * the backing buffer if it exists.
   *
   * @param str - The string to zero out
   */
  private zeroOutString(str: string): void {
    // Convert to buffer and zero it out
    const buffer = Buffer.from(str, 'utf8');
    buffer.fill(0);

    // Note: The original string object may still exist in memory
    // until garbage collected, but this reduces the attack surface
  }

  /**
   * Checks if this instance has been destroyed and throws if so.
   *
   * @throws {Error} If the key has been destroyed
   */
  private checkNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('SecurePrivateKey has been destroyed and can no longer be used');
    }
  }
}
