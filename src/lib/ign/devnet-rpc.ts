import { IGN_DEVNET } from "./asset-registry";

/** Public RPC reads only. No key material, private wallet addresses or signing. */
type JsonRpcResponse<T> = { result?: T; error?: { message?: string } };
type TokenAccount = { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number }; mint?: string } } } } };
type AccountInfo = { value: { owner?: string; data?: { parsed?: { info?: { mintAuthority?: string | null; freezeAuthority?: string | null; decimals?: number; supply?: string } } } } | null };
export type MintSnapshot = { supplyAtomic: bigint; mintAuthority: string | null; freezeAuthority: string | null; slot: number };
export type OwnerSnapshot = { amountAtomic: bigint; accounts: number; slot: number };

export function isSolanaPublicKey(text: string): boolean {
  // Base58 structure; the RPC remains the ultimate validator of curve/length.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
}
async function readRpc<T>(method: string, params: unknown[], signal?: AbortSignal): Promise<{ context?: { slot?: number }; value?: T }> {
  let response: Response;
  try {
    response = await fetch(IGN_DEVNET.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Devnet RPC unavailable. Please try again later.");
  }
  if (!response.ok) throw new Error(`Devnet RPC returned HTTP ${response.status}; try again later.`);
  const body: JsonRpcResponse<{ context?: { slot?: number }; value?: T }> = await response.json();
  if (body.error) throw new Error(`Devnet RPC: ${body.error.message ?? "query failed"}`);
  if (!body.result || !("value" in body.result)) throw new Error("Unexpected Devnet RPC response");
  return body.result;
}

/** Verify mint facts live; do not turn stale design figures into live token stats. */
export async function getIgnMintSnapshot(signal?: AbortSignal): Promise<MintSnapshot> {
  const result = await readRpc<AccountInfo["value"]>("getAccountInfo", [
    IGN_DEVNET.mint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ], signal);
  const info = result.value?.data?.parsed?.info;
  if (!info || result.value?.owner !== IGN_DEVNET.tokenProgram || typeof info.supply !== "string" || !/^\d+$/.test(info.supply) || info.decimals !== IGN_DEVNET.decimals ||\n      !Object.prototype.hasOwnProperty.call(info, "mintAuthority") ||\n      !Object.prototype.hasOwnProperty.call(info, "freezeAuthority")) {
    throw new Error("IGN Devnet mint could not be verified");
  }
  return {
    supplyAtomic: BigInt(info.supply),
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    slot: result.context?.slot ?? 0,
  };
}
export async function getIgnOwnerSnapshot(owner: string, signal?: AbortSignal): Promise<OwnerSnapshot> {
  if (!isSolanaPublicKey(owner)) throw new Error("Enter a valid Solana public address");
  const result = await readRpc<TokenAccount[]>("getTokenAccountsByOwner", [
    owner,
    { mint: IGN_DEVNET.mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ], signal);
  if (!Array.isArray(result.value)) throw new Error("Unexpected Devnet token account response");
  let amountAtomic = 0n;
  for (const tokenAccount of result.value) {
    const data = tokenAccount.account?.data?.parsed?.info;
    if (data?.mint !== IGN_DEVNET.mint ||
        data.tokenAmount?.decimals !== IGN_DEVNET.decimals ||
        typeof data.tokenAmount.amount !== "string" ||
        !/^\d+$/.test(data.tokenAmount.amount)) {
      throw new Error("Invalid IGN account returned from Devnet RPC");
    }
    amountAtomic += BigInt(data.tokenAmount.amount);
  }
  return { amountAtomic, accounts: result.value.length, slot: result.context?.slot ?? 0 };
}
