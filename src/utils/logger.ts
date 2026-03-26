/**
 * Logger utility for Teneo Protocol SDK
 * Provides console-based logging with level filtering
 */

import type { Logger, LogLevel } from "../types";

const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};

function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  try {
    return " " + JSON.stringify(data, null, 2);
  } catch {
    return " " + String(data);
  }
}

/**
 * Creates a console-based logger that conforms to the SDK Logger interface.
 * Filters messages below the configured log level.
 *
 * @param level - Log level (debug, info, warn, error, silent)
 * @param name - Logger name for identifying log source (e.g., "TeneoSDK", "WebSocketClient")
 * @returns Logger instance compatible with SDK Logger interface
 *
 * @example
 * ```typescript
 * const logger = createConsoleLogger('info', 'TeneoSDK');
 * logger.info('SDK initialized', { wsUrl: 'wss://example.com' });
 * logger.error('Connection failed', { code: 'CONN_FAILED', attempt: 3 });
 * ```
 */
export function createConsoleLogger(level: LogLevel, name?: string): Logger {
  const threshold = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  const prefix = name ? `[${name}]` : "";

  return {
    debug: (message: string, data?: unknown) => {
      if (threshold <= LOG_LEVELS.debug) {
        console.debug(`${prefix} ${message}${formatData(data)}`);
      }
    },
    info: (message: string, data?: unknown) => {
      if (threshold <= LOG_LEVELS.info) {
        console.info(`${prefix} ${message}${formatData(data)}`);
      }
    },
    warn: (message: string, data?: unknown) => {
      if (threshold <= LOG_LEVELS.warn) {
        console.warn(`${prefix} ${message}${formatData(data)}`);
      }
    },
    error: (message: string, data?: unknown) => {
      if (threshold <= LOG_LEVELS.error) {
        console.error(`${prefix} ${message}${formatData(data)}`);
      }
    }
  };
}

/** @deprecated Use createConsoleLogger instead */
export const createPinoLogger = createConsoleLogger;
