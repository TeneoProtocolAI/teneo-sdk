/**
 * ERC20 utilities for wallet transaction flows.
 *
 * These helpers let SDK consumers check ERC20 token allowances before sending
 * approval transactions, avoiding unnecessary approvals when allowance is
 * already sufficient.
 */

/** The 4-byte function selector for ERC20 approve(address,uint256) */
export const ERC20_APPROVE_SELECTOR = "0x095ea7b3";

/** The 4-byte function selector for ERC20 allowance(address,address) */
const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";

/**
 * Check if a trigger_wallet_tx calldata is an ERC20 approve call.
 * Returns the spender address if it is, or null otherwise.
 *
 * @param data - The calldata hex string from the trigger_wallet_tx
 * @returns The spender address, or null if not an approve call
 *
 * @example
 * ```typescript
 * sdk.on("wallet:tx_requested", async (data) => {
 *   const approveInfo = parseApproveCalldata(data.tx.data);
 *   if (approveInfo) {
 *     // This is an ERC20 approve — check allowance first
 *     const allowance = await checkERC20Allowance(rpcUrl, data.tx.to, myAddress, approveInfo.spender);
 *     if (allowance >= approveInfo.amount) {
 *       // Allowance sufficient for requested amount, skip approval
 *       await sdk.sendTxResult(data.taskId, "confirmed", undefined, undefined, data.room, data.tx.chainId);
 *       return;
 *     }
 *   }
 *   // Proceed with normal tx signing...
 * });
 * ```
 */
export function parseApproveCalldata(data?: string): { spender: string; amount: bigint } | null {
  if (!data || !data.toLowerCase().startsWith(ERC20_APPROVE_SELECTOR)) {
    return null;
  }
  // approve(address spender, uint256 amount)
  // calldata = 0x095ea7b3 + 32-byte left-padded spender + 32-byte amount
  // Full calldata: "0x" (2) + selector (8) + spender (64) + amount (64) = 138 chars
  if (data.length < 138) return null;
  const spender = "0x" + data.slice(34, 74);
  const amount = BigInt("0x" + data.slice(74, 138));
  return { spender, amount };
}

/**
 * Build the eth_call data for checking ERC20 allowance(owner, spender).
 * Returns the hex-encoded calldata string.
 */
function buildAllowanceCalldata(owner: string, spender: string): string {
  const ownerHex = owner.toLowerCase().replace("0x", "").padStart(64, "0");
  const spenderHex = spender.toLowerCase().replace("0x", "").padStart(64, "0");
  return ERC20_ALLOWANCE_SELECTOR + ownerHex + spenderHex;
}

/**
 * Check the ERC20 allowance for a token via a JSON-RPC eth_call.
 *
 * This is a standalone utility that works with any JSON-RPC endpoint — it does
 * not require wagmi, viem, or ethers. SDK consumers can use this in their
 * `wallet:tx_requested` handler to skip unnecessary approval transactions.
 *
 * @param rpcUrl - The JSON-RPC endpoint URL for the token's chain
 * @param tokenAddress - The ERC20 token contract address
 * @param owner - The token owner (user's wallet address)
 * @param spender - The spender address (from parseApproveCalldata)
 * @returns The allowance as a bigint
 *
 * @example
 * ```typescript
 * const allowance = await checkERC20Allowance(
 *   "https://mainnet.base.org",
 *   "0xA0b8...USDC",
 *   userWallet,
 *   spenderAddress
 * );
 * if (allowance >= requiredAmount) {
 *   console.log("Sufficient allowance, skipping approval");
 * }
 * ```
 */
export async function checkERC20Allowance(
  rpcUrl: string,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const calldata = buildAllowanceCalldata(owner, spender);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddress, data: calldata }, "latest"]
    })
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  const result = (await response.json()) as { result?: string; error?: { message: string } };

  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }

  if (!result.result || result.result === "0x") {
    return 0n;
  }

  return BigInt(result.result);
}
