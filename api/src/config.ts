import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const repoRoot = path.join(rootDir, "..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(rootDir, ".env"), override: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || true,
  adminPassword: process.env.ADMIN_PASSWORD?.trim() || "",
  tokenMint: process.env.TOKEN_MINT?.trim() || "",
  rpcUrl: process.env.RPC_URL?.trim() || "https://api.mainnet-beta.solana.com",
  holderPollMs: Number(process.env.HOLDER_POLL_MS ?? 120000),
  mockHolders: process.env.MOCK_HOLDERS === "1",
  holderMinAmountRaw: BigInt(process.env.HOLDER_MIN_AMOUNT_RAW ?? "0"),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
  mockHoldersPath: process.env.MOCK_HOLDERS_PATH?.trim() || path.join(repoRoot, "mock-holders.json"),
};

export function getHolderRpcUrl(): string {
  const holderRpc = process.env.HOLDER_RPC_URL?.trim();
  if (holderRpc) return holderRpc;
  return config.rpcUrl;
}
