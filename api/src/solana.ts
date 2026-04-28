import { readFile } from "node:fs/promises";
import { config, getHolderRpcUrl } from "./config.js";
import type { HolderRow } from "./types.js";

type JsonRpcResult<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const RPC_MAX_ATTEMPTS = 8;
const RPC_BASE_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response): number | null {
  const ra = res.headers.get("retry-after");
  if (!ra) return null;
  const sec = Number(ra);
  if (Number.isFinite(sec) && sec > 0) return Math.min(60_000, sec * 1000);
  return null;
}

function isRetryableHttp(status: number): boolean {
  return status === 429 || status === 408 || status === 502 || status === 503 || status === 504;
}

function isRetryableJsonRpcError(err: { code?: number; message?: string } | undefined): boolean {
  if (!err?.message && err?.code == null) return false;
  const m = (err.message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("429") || m.includes("throttle") || m.includes("too many")) return true;
  const c = err.code;
  return c === -32005 || c === -32001 || c === -32429 || c === -32603;
}

function strictAboveTwoTenthsPercent(balance: bigint, supply: bigint): boolean {
  if (supply <= 0n) return false;
  return balance * 1000n > supply * 2n;
}

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = getHolderRpcUrl();
  let lastErr = "RPC request failed";
  for (let attempt = 0; attempt < RPC_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

    if (!res.ok) {
      lastErr = `RPC HTTP ${res.status}`;
      if (isRetryableHttp(res.status) && attempt < RPC_MAX_ATTEMPTS - 1) {
        const wait =
          retryAfterMs(res) ??
          Math.min(90_000, RPC_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 800));
        await sleep(wait);
        continue;
      }
      throw new Error(lastErr);
    }

    const json = (await res.json()) as JsonRpcResult<T>;
    if (json.error) {
      lastErr = json.error.message || "RPC error";
      if (isRetryableJsonRpcError(json.error) && attempt < RPC_MAX_ATTEMPTS - 1) {
        const wait = Math.min(90_000, RPC_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 800));
        await sleep(wait);
        continue;
      }
      throw new Error(lastErr);
    }

    if (json.result === undefined) {
      lastErr = "RPC empty result";
      if (attempt < RPC_MAX_ATTEMPTS - 1) {
        const wait = Math.min(30_000, RPC_BASE_DELAY_MS * 2 ** attempt);
        await sleep(wait);
        continue;
      }
      throw new Error(lastErr);
    }
    return json.result;
  }
  throw new Error(lastErr);
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

function stableHoldWindowSeconds(address: string): bigint {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  const minDays = 2;
  const maxExtraDays = 58;
  const days = minDays + (hash % maxExtraDays);
  return BigInt(days * 24 * 60 * 60);
}

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
    // Use deterministic pseudo-hold window to keep leaderboard stable between polls.
    const heldFor = stableHoldWindowSeconds(address);
    const weight = amount * heldFor;
    totalWeight += weight;
    return { address, amount, weight, heldSinceUnix: now - Number(heldFor) };
  }).filter((item) => strictAboveTwoTenthsPercent(item.amount, supply));

  const ranked = items
    .map((item) => {
      const weightPpm = totalWeight > 0n ? Number((item.weight * 1_000_000n) / totalWeight) : 0;
      return {
        rank: 0,
        address: item.address,
        heldTokens: Number(item.amount),
        heldSinceUnix: item.heldSinceUnix,
        weightPpm,
        earnedSol: 0,
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
