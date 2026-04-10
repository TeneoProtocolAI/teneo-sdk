import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseApproveCalldata, checkERC20Allowance, ERC20_APPROVE_SELECTOR } from "./erc20";

describe("parseApproveCalldata", () => {
  // Valid approve calldata: approve(0x1234...5678, max_uint256)
  const spender = "1234567890abcdef1234567890abcdef12345678";
  const maxUint256Hex = "f".repeat(64);
  const validCalldata = ERC20_APPROVE_SELECTOR + spender.padStart(64, "0") + maxUint256Hex;

  it("should parse valid approve calldata", () => {
    const result = parseApproveCalldata(validCalldata);
    expect(result).not.toBeNull();
    expect(result!.spender).toBe(`0x${spender}`);
    expect(result!.amount).toBe(BigInt("0x" + maxUint256Hex));
  });

  it("should return null for undefined data", () => {
    expect(parseApproveCalldata(undefined)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseApproveCalldata("")).toBeNull();
  });

  it("should return null for short data", () => {
    expect(parseApproveCalldata("0x095ea7b3")).toBeNull();
  });

  it("should return null for wrong selector", () => {
    const wrongSelector = "0xa9059cbb" + "0".repeat(128); // transfer() selector
    expect(parseApproveCalldata(wrongSelector)).toBeNull();
  });

  it("should return null for data shorter than 138 chars", () => {
    const shortData = ERC20_APPROVE_SELECTOR + "0".repeat(60); // only 68 + 10 = 78 chars
    expect(parseApproveCalldata(shortData)).toBeNull();
  });

  it("should handle uppercase hex", () => {
    const upper = validCalldata.toUpperCase();
    // selector check lowercases, so "0X" prefix won't match "0x"
    const withLowerPrefix = "0x" + upper.slice(2);
    const result = parseApproveCalldata(withLowerPrefix);
    expect(result).not.toBeNull();
    expect(result!.spender).toBe(`0x${spender.toUpperCase()}`);
  });

  it("should parse a specific amount correctly", () => {
    const amount = "0000000000000000000000000000000000000000000000000de0b6b3a7640000"; // 1e18
    const calldata = ERC20_APPROVE_SELECTOR + "0".repeat(24) + spender + amount;
    const result = parseApproveCalldata(calldata);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(BigInt("0xde0b6b3a7640000")); // 1e18 in hex
  });

  it("should parse zero amount", () => {
    const calldata = ERC20_APPROVE_SELECTOR + "0".repeat(24) + spender + "0".repeat(64);
    const result = parseApproveCalldata(calldata);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(0n);
  });
});

describe("checkERC20Allowance", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rpcUrl = "https://rpc.example.com";
  const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const owner = "0x1111111111111111111111111111111111111111";
  const spender = "0x2222222222222222222222222222222222222222";

  it("should return allowance as bigint", async () => {
    const allowanceHex = "0x00000000000000000000000000000000000000000000000000000000000f4240"; // 1000000
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: allowanceHex })
    });

    const result = await checkERC20Allowance(rpcUrl, tokenAddress, owner, spender);
    expect(result).toBe(1000000n);
  });

  it("should return 0n for zero allowance", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: "0x" })
    });

    const result = await checkERC20Allowance(rpcUrl, tokenAddress, owner, spender);
    expect(result).toBe(0n);
  });

  it("should throw on RPC error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ error: { message: "execution reverted" } })
    });

    await expect(checkERC20Allowance(rpcUrl, tokenAddress, owner, spender)).rejects.toThrow(
      "RPC error: execution reverted"
    );
  });

  it("should throw on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503
    });

    await expect(checkERC20Allowance(rpcUrl, tokenAddress, owner, spender)).rejects.toThrow(
      "RPC request failed with status 503"
    );
  });

  it("should throw on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    await expect(checkERC20Allowance(rpcUrl, tokenAddress, owner, spender)).rejects.toThrow(
      "fetch failed"
    );
  });

  it("should send correct eth_call params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: "0x0" })
    });

    await checkERC20Allowance(rpcUrl, tokenAddress, owner, spender);

    expect(mockFetch).toHaveBeenCalledWith(
      rpcUrl,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe("eth_call");
    expect(body.params[0].to).toBe(tokenAddress);
    // Should contain allowance selector 0xdd62ed3e
    expect(body.params[0].data.startsWith("0xdd62ed3e")).toBe(true);
    expect(body.params[1]).toBe("latest");
  });

  it("should handle max uint256 allowance", async () => {
    const maxAllowance = "0x" + "f".repeat(64);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: maxAllowance })
    });

    const result = await checkERC20Allowance(rpcUrl, tokenAddress, owner, spender);
    expect(result).toBe(BigInt(maxAllowance));
  });
});
