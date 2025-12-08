/**
 * Payment module exports
 * Provides x402 payment signing capabilities for Teneo Protocol SDK
 */

export {
  PaymentSigner,
  type PaymentSignerConfig,
  type CreatePaymentHeaderOptions
} from "./payment-signer";

export {
  PEAQ_CHAIN,
  USDC_CONTRACT,
  DEFAULT_PAY_TO_ADDRESS,
  DEFAULT_RPC_URL,
  USDC_DECIMALS,
  X402_VERSION,
  DEFAULT_PAYMENT_TIMEOUT_SECONDS,
  buildX402ResourceUrl,
  usdcToUnits,
  unitsToUsdc,
  type SupportedChain
} from "./payment-config";
