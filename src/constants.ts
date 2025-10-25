/**
 * Timeout constants for various SDK operations
 */
export const TIMEOUTS = {
  /** Wait time for cached auth response */
  CACHED_AUTH_WAIT: 1000,
  /** WebSocket ping interval */
  PING_INTERVAL: 30_000,
  /** Default message response timeout */
  DEFAULT_MESSAGE_TIMEOUT: 30_000,
  /** Authentication timeout */
  AUTH_TIMEOUT: 30_000,
  /** Initial connection timeout */
  CONNECTION_TIMEOUT: 30_000,
  /** Webhook delivery timeout */
  WEBHOOK_TIMEOUT: 10_000,
  /** Auth state polling interval */
  AUTH_POLL_INTERVAL: 100
} as const;

/**
 * Retry and backoff constants
 */
export const RETRY = {
  /** Base delay for exponential backoff */
  BASE_DELAY: 1000,
  /** Maximum retry delay */
  MAX_DELAY: 30_000,
  /** Maximum webhook retry delay */
  MAX_WEBHOOK_DELAY: 30_000,
  /** Maximum reconnection delay */
  MAX_RECONNECT_DELAY: 60_000
} as const;

/**
 * Limits and constraints
 */
export const LIMITS = {
  /** Maximum message size (2MB) */
  MAX_MESSAGE_SIZE: 2 * 1024 * 1024,
  /** Random jitter for reconnection */
  MAX_JITTER: 1000
} as const;
