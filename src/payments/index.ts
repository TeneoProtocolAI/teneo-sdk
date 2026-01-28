/**
 * Payment module exports for quote-approve flow (v2.2.0)
 * Multi-network support added in v2.3.0
 */

export {
  PaymentClient,
  type PaymentClientConfig,
  // Constants (legacy, for backwards compatibility)
  USDC_CONTRACT,
  PEAQ_CHAIN_ID,
  USDC_DECIMALS,
  X402_VERSION,
  DEFAULT_PAYMENT_TIMEOUT_SECONDS,
  DEFAULT_PAY_TO_ADDRESS,
  // Utilities
  buildX402ResourceUrl,
  usdcToUnits,
  unitsToUsdc
} from "./payment-client";

// Multi-network support (v2.3.0)
export {
  type NetworkConfig,
  NETWORKS,
  CHAIN_ID_TO_NETWORK,
  CAIP2_TO_NETWORK,
  getNetwork,
  getDefaultNetwork,
  createChainDefinition,
  isNetworkSupported,
  getSupportedNetworks
} from "./networks";
