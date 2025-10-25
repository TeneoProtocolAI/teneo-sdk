/**
 * Health status types for monitoring SDK state
 */

export interface HealthStatus {
  /** Overall health status: healthy, degraded, or unhealthy */
  status: "healthy" | "degraded" | "unhealthy";

  /** Timestamp of health check */
  timestamp: string;

  /** WebSocket connection health */
  connection: {
    status: "connected" | "disconnected" | "reconnecting";
    authenticated: boolean;
    reconnectAttempts: number;
  };

  /** Webhook delivery health */
  webhook: {
    configured: boolean;
    status: "healthy" | "degraded" | "unhealthy";
    pending: number;
    failed: number;
    circuitState: string;
  };

  /** Rate limiter status (if configured) */
  rateLimit?: {
    availableTokens: number;
    tokensPerSecond: number;
    maxBurst: number;
  };

  /** Agent registry health */
  agents: {
    count: number;
    lastUpdate?: Date;
  };

  /** Room management health */
  rooms: {
    count: number;
    subscribedRooms: string[];
  };
}
