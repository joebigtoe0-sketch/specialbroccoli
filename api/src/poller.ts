import { config } from "./config.js";
import { runtime } from "./runtime.js";
import { fetchChainHolders, loadMockHolders } from "./solana.js";

export async function runHolderFetch(): Promise<void> {
  runtime.lastAttemptUnix = Math.floor(Date.now() / 1000);
  try {
    if (!config.mockHolders && !runtime.tokenMint) {
      runtime.snapshot = {
        items: [],
        source: "chain",
        fetchedAtUnix: Math.floor(Date.now() / 1000),
        error: "Token mint is not set. Configure it in /admin first.",
      };
      return;
    }

    const useMock = config.mockHolders;
    const items = useMock ? await loadMockHolders() : await fetchChainHolders(runtime.tokenMint);

    runtime.snapshot = {
      items,
      source: useMock ? "mock" : "chain",
      fetchedAtUnix: Math.floor(Date.now() / 1000),
      error: null,
    };
    runtime.lastSuccessUnix = runtime.snapshot.fetchedAtUnix;
  } catch (error) {
    runtime.snapshot.error = error instanceof Error ? error.message : String(error);
    runtime.snapshot.source = config.mockHolders ? "mock" : "chain";
    // Keep last successful items instead of wiping snapshot on transient RPC failures.
    runtime.snapshot.fetchedAtUnix = runtime.snapshot.fetchedAtUnix ?? Math.floor(Date.now() / 1000);
  }
}

export async function startPoller(): Promise<void> {
  if (runtime.pollRunning) return;
  runtime.pollRunning = true;
  runtime.cycleStartedAtUnix = Math.floor(Date.now() / 1000);
  await runHolderFetch();
  runtime.pollInterval = setInterval(() => {
    void runHolderFetch();
  }, config.holderPollMs);
}

export function stopPoller(): void {
  runtime.pollRunning = false;
  runtime.cycleStartedAtUnix = null;
  if (runtime.pollInterval) {
    clearInterval(runtime.pollInterval);
    runtime.pollInterval = null;
  }
}

export function setTokenMint(tokenMint: string): void {
  runtime.tokenMint = tokenMint.trim();
}
