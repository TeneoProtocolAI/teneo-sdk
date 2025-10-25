/**
 * Utility functions and helpers for the Teneo Protocol SDK
 */

/**
 * Logger creation utilities
 */
export { createPinoLogger } from "./logger";

/**
 * SSRF protection utilities for webhook URL validation
 * Prevents Server-Side Request Forgery attacks
 */
export { validateWebhookUrl, isPrivateIP, isCloudMetadataEndpoint } from "./ssrf-validator";

/**
 * Event waiting utilities for async event handling
 * Wait for specific events with timeout support
 */
export {
  waitForEvent,
  waitForAnyEvent,
  waitForAllEvents,
  type WaitForEventOptions
} from "./event-waiter";

/**
 * Memory-safe bounded queue with overflow strategies
 * Prevents unbounded memory growth
 */
export { BoundedQueue, QueueOverflowError, type OverflowStrategy } from "./bounded-queue";

/**
 * Token bucket rate limiter for request throttling
 */
export { TokenBucketRateLimiter, RateLimitError } from "./rate-limiter";

/**
 * Circuit breaker pattern for fault tolerance
 * Prevents cascading failures with automatic recovery
 */
export { CircuitBreaker, CircuitBreakerError, type CircuitState } from "./circuit-breaker";

/**
 * Message deduplication cache with TTL support
 */
export { DeduplicationCache } from "./deduplication-cache";

/**
 * Ethereum signature verification utilities (SEC-2)
 * ECDSA signature validation for message authenticity
 */
export {
  SignatureVerifier,
  type SignatureVerificationOptions,
  type VerificationResult
} from "./signature-verifier";

/**
 * Secure private key storage with AES-256-GCM encryption (SEC-3)
 * Protects private keys from memory dumps
 */
export { SecurePrivateKey } from "./secure-private-key";

/**
 * Configurable retry strategies for resilient operations (REL-3)
 * Supports exponential, linear, and constant backoff
 */
export {
  RetryPolicy,
  RetryStrategySchema,
  type RetryStrategy,
  type RetryStrategyType
} from "./retry-policy";
