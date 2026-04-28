import { readFile } from "node:fs/promises";
import { config } from "./config.js";
import type { HolderRow } from "./types.js";

type JsonRpcResult<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}`);
  }
  const json = (await res.json()) as JsonRpcResult<T>;
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }
  if (json.result === undefined) {
    throw new Error("RPC empty result");
  }
  return json.result;
}

async function fetchTokenSupplyRaw(mint: string): Promise<bigint> {
  const result = await rpcRequest<{ value: { amount: string } | null }>("getTokenSupply", [mint]);
  return BigInt(result.value?.amount || "0");
}

async function detectMintProgram(mint: string): Promise<string> {
  const result = await rpcRequest<{ value: { owner: string } | null }>("getAccountInfo", [
    mint,
    { encoding: "jsonParsed" },
  ]);
  const owner = result.value?.owner;
  if (!owner) throw new Error("Mint account not found");
  if (owner !== SPL_TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) {
    throw new Error("Mint owner is not SPL or Token-2022");
  }
  return owner;
}

type ProgramAccount = {
  account?: {
    data?: {
      parsed?: {
        type?: string;
        info?: {
          mint?: string;
          owner?: string;
          tokenAmount?: { amount?: string };
        };
      };
    };
  };
};

export async function fetchChainHolders(mint: string): Promise<HolderRow[]> {
  const supply = await fetchTokenSupplyRaw(mint);
  if (supply <= 0n) return [];
  const program = await detectMintProgram(mint);
  const filters =
    program === TOKEN_2022_PROGRAM
      ? [{ memcmp: { offset: 0, bytes: mint } }]
      : [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }];

  const rows = await rpcRequest<ProgramAccount[]>("getProgramAccounts", [
    program,
    { encoding: "jsonParsed", filters },
  ]);

  const byOwner = new Map<string, bigint>();
  for (const row of rows || []) {
    const parsed = row.account?.data?.parsed;
    if (parsed?.type !== "account") continue;
    const info = parsed.info;
    if (!info?.owner || !info.tokenAmount?.amount) continue;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount <= 0n) continue;
    if (info.mint && info.mint !== mint) continue;
    if (amount < config.holderMinAmountRaw) continue;
    byOwner.set(info.owner, (byOwner.get(info.owner) ?? 0n) + amount);
  }

  let totalWeight = 0n;
  const now = Math.floor(Date.now() / 1000);
  const items = Array.from(byOwner.entries()).map(([address, amount]) => {
    // This is mock-weighting for the prototype: amount x random hold window.
    const heldFor = BigInt(7 * 24 * 60 * 60 + Math.floor(Math.random() * 7 * 24 * 60 * 60));
    const weight = amount * heldFor;
    totalWeight += weight;
    return { address, amount, weight, heldSinceUnix: now - Number(heldFor) };
  });

  const ranked = items
    .map((item) => {
      const weightPpm = totalWeight > 0n ? Number((item.weight * 1_000_000n) / totalWeight) : 0;
      const earnedSol = Number((BigInt(weightPpm) * 1000000000n) / 1_000_000n) / 1_000_000000;
      return {
        rank: 0,
        address: item.address,
        heldTokens: Number(item.amount),
        heldSinceUnix: item.heldSinceUnix,
        weightPpm,
        earnedSol,
      };
    })
    .sort((a, b) => b.weightPpm - a.weightPpm)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  return ranked;
}

export async function loadMockHolders(): Promise<HolderRow[]> {
  const text = await readFile(config.mockHoldersPath, "utf-8");
  return JSON.parse(text) as HolderRow[];
}
