import crypto from "crypto";
import { SecurePrivateKey } from "./secure-private-key";
import { signTypedData } from "viem/accounts";
import { ConfigurationError } from "../types/events";

const EIP155_NETWORK_REGEX = /^eip155:(\d+)$/;

export interface PaymentConfig {
  network: string;
  asset: string;
  facilitatorUrl?: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, any>;
}

export interface X402PaymentHeader {
  x402Version: number;
  accepted: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: Record<string, any>;
  };
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
}

const USDC_TRANSFER_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const;

function generateNonce(): string {
  return "0x" + crypto.randomBytes(32).toString("hex");
}

export class PaymentClient {
  private readonly secureKey: SecurePrivateKey;
  private readonly config: PaymentConfig;
  private readonly walletAddress: string;

  constructor(secureKey: SecurePrivateKey, walletAddress: string, config: PaymentConfig) {
    // Validate network format - only EIP-155 networks are supported for EIP-712 signatures
    if (!EIP155_NETWORK_REGEX.test(config.network)) {
      throw new ConfigurationError(
        `Invalid payment network format: "${config.network}". ` +
          `Only EIP-155 networks are supported (e.g., "eip155:1" for Ethereum mainnet, "eip155:3338" for Peaq).`,
        { network: config.network, expectedFormat: "eip155:<chainId>" }
      );
    }

    this.secureKey = secureKey;
    this.walletAddress = walletAddress;
    this.config = config;
  }

  async createPaymentHeader(
    amount: number,
    payTo: string,
    resourceUrl: string
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now.toString();
    const validBefore = (now + 600).toString();
    const nonce = generateNonce();
    const amountStr = amount.toString();

    const domain = {
      name: "USDC",
      version: "2",
      chainId: this.getChainIdFromNetwork(),
      verifyingContract: this.config.asset as `0x${string}`
    };

    const message = {
      from: this.walletAddress as `0x${string}`,
      to: payTo as `0x${string}`,
      value: BigInt(amountStr),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`
    };

    const signature = await this.secureKey.use(async (key) => {
      return await signTypedData({
        domain,
        types: USDC_TRANSFER_AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message,
        privateKey: key as `0x${string}`
      });
    });

    const header: X402PaymentHeader = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: this.config.network,
        amount: amountStr,
        asset: this.config.asset,
        payTo,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" }
      },
      payload: {
        authorization: {
          from: this.walletAddress,
          to: payTo,
          value: amountStr,
          validAfter,
          validBefore,
          nonce
        },
        signature
      },
      resource: {
        url: resourceUrl,
        description: "Teneo SDK payment",
        mimeType: "application/json"
      }
    };

    return Buffer.from(JSON.stringify(header)).toString("base64");
  }

  private getChainIdFromNetwork(): number {
    const match = this.config.network.match(EIP155_NETWORK_REGEX);
    if (match) {
      return parseInt(match[1], 10);
    }
    // This should never happen due to constructor validation, but throw to be safe
    throw new ConfigurationError(
      `Cannot extract chain ID from network: "${this.config.network}"`,
      { network: this.config.network }
    );
  }
}

