/**
 * Payment module exports for quote-approve flow (v2.2.0)
 */

export {
  PaymentClient,
  type PaymentClientConfig,
  // Constants
  USDC_CONTRACT,
  PEAQ_CHAIN_ID,
  USDC_DECIMALS,
  X402_VERSION,
  DEFAULT_PAYMENT_TIMEOUT_SECONDS,
  DEFAULT_PAY_TO_ADDRESS,
  DEFAULT_RPC_URL,
  // Utilities
  buildX402ResourceUrl,
  usdcToUnits,
  unitsToUsdc,
  // Types
  type SupportedChain
} from "./payment-client";
