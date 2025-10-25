/**
 * Logger utility for Teneo Protocol SDK
 * Provides pino-based logging with structured output and optional pretty printing
 */

import pino from "pino";
import type { Logger, LogLevel } from "../types";

/**
 * Creates a pino-based logger that conforms to the SDK Logger interface.
 * Automatically configures pretty printing for development environments.
 *
 * @param level - Log level (debug, info, warn, error, silent)
 * @param name - Logger name for identifying log source (e.g., "TeneoSDK", "WebSocketClient")
 * @returns Logger instance compatible with SDK Logger interface
 *
 * @example
 * ```typescript
 * const logger = createPinoLogger('info', 'TeneoSDK');
 * logger.info('SDK initialized', { wsUrl: 'wss://example.com' });
 * logger.error('Connection failed', { code: 'CONN_FAILED', attempt: 3 });
 * ```
 */
export function createPinoLogger(level: LogLevel, name?: string): Logger {
  // Map 'silent' to pino's 'silent' level
  const pinoLevel = level === "silent" ? "silent" : level;

  // Create pino logger with optional pretty printing for development
  const pinoLogger = pino({
    level: pinoLevel,
    name: name || "TeneoSDK",
    // Use pino-pretty in development for readable logs
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              translateTime: "HH:MM:ss.l",
              singleLine: false
            }
          }
        : undefined,
    // Production: fast JSON logs
    formatters:
      process.env.NODE_ENV === "production"
        ? {
            level: (label) => {
              return { level: label };
            }
          }
        : undefined
  });

  // Adapt pino's API to match our Logger interface
  return {
    debug: (message: string, data?: any) => {
      if (data !== undefined) {
        pinoLogger.debug(data, message);
      } else {
        pinoLogger.debug(message);
      }
    },
    info: (message: string, data?: any) => {
      if (data !== undefined) {
        pinoLogger.info(data, message);
      } else {
        pinoLogger.info(message);
      }
    },
    warn: (message: string, data?: any) => {
      if (data !== undefined) {
        pinoLogger.warn(data, message);
      } else {
        pinoLogger.warn(message);
      }
    },
    error: (message: string, data?: any) => {
      if (data !== undefined) {
        pinoLogger.error(data, message);
      } else {
        pinoLogger.error(message);
      }
    }
  };
}
