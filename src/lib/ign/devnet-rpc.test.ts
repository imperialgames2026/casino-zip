import { afterEach, describe, expect, it, vi } from "vitest";
import { getIgnMintSnapshot, getIgnOwnerSnapshot, isSolanaPublicKey } from "./devnet-rpc";
import { IGN_DEVNET } from "./asset-registry";

const wallet = "CKgnBNxD28BqZ89w9YJRV3WwtumdKgsoUhmrgjoTXHrH";
const response = (result: unknown) => ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) });
afterEach(() => vi.unstubAllGlobals());

describe("read-only Solana Devnet queries", () => {
  it("validates wallet address before issuing any RPC", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(isSolanaPublicKey(wallet)).toBe(true);
    expect(isSolanaPublicKey("0x00000000000000000000")).toBe(false);
    await expect(getIgnOwnerSnapshot("not-an-address")).rejects.toThrow("valid Solana public");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("queries a Devnet mint and accurately parses a 10B fixed supply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      context: { slot: 123 },
      value: { data: { parsed: { info: { decimals: 9, supply: "10000000000000000000", mintAuthority: null, freezeAuthority: null } } } },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const mint = await getIgnMintSnapshot();
    expect(mint.supplyAtomic).toBe(10_000_000_000_000_000_000n);
    expect(mint.mintAuthority).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(IGN_DEVNET.rpcUrl);
    const body = JSON.parse(String(init.body));
    expect(body.method).toBe("getAccountInfo");
    expect(body.params[0]).toBe(IGN_DEVNET.mint);
  });
  it("handles no ATA, and sums multiple accounts exactly without Number conversion", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ context: { slot: 9 }, value: [] }))
      .mockResolvedValueOnce(response({ context: { slot: 10 }, value: [
        { account: { data: { parsed: { info: { mint: IGN_DEVNET.mint, tokenAmount: { amount: "9007199254740993", decimals: 9 } } } } } },
        { account: { data: { parsed: { info: { mint: IGN_DEVNET.mint, tokenAmount: { amount: "11", decimals: 9 } } } } } },
      ] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getIgnOwnerSnapshot(wallet)).toMatchObject({ amountAtomic: 0n, accounts: 0, slot: 9 });
    expect(await getIgnOwnerSnapshot(wallet)).toMatchObject({ amountAtomic: 9007199254741004n, accounts: 2, slot: 10 });
  });
  it("fails closed on RPC errors or mismatching token data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      context: { slot: 22 }, value: [
        { account: { data: { parsed: { info: { mint: "wrong", tokenAmount: { amount: "100", decimals: 9 } } } } } },
      ],
    })));
    await expect(getIgnOwnerSnapshot(wallet)).rejects.toThrow("Invalid IGN account");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(getIgnOwnerSnapshot(wallet)).rejects.toThrow("429");
  });
});
