import { config } from "./config.js";
import { runtime } from "./runtime.js";
import { fetchChainHolders, loadMockHolders } from "./solana.js";

export async function runHolderFetch(): Promise<void> {
  runtime.lastAttemptUnix = Math.floor(Date.now() / 1000);
  try {
    const items =
      config.mockHolders || !runtime.tokenMint ? await loadMockHolders() : await fetchChainHolders(runtime.tokenMint);

    runtime.snapshot = {
      items,
      source: config.mockHolders || !runtime.tokenMint ? "mock" : "chain",
      fetchedAtUnix: Math.floor(Date.now() / 1000),
      error: null,
    };
    runtime.lastSuccessUnix = runtime.snapshot.fetchedAtUnix;
  } catch (error) {
    runtime.snapshot.error = error instanceof Error ? error.message : String(error);
  }
}

export async function startPoller(): Promise<void> {
  if (runtime.pollRunning) return;
  runtime.pollRunning = true;
  await runHolderFetch();
  runtime.pollInterval = setInterval(() => {
    void runHolderFetch();
  }, config.holderPollMs);
}

export function stopPoller(): void {
  runtime.pollRunning = false;
  if (runtime.pollInterval) {
    clearInterval(runtime.pollInterval);
    runtime.pollInterval = null;
  }
}

export function setTokenMint(tokenMint: string): void {
  runtime.tokenMint = tokenMint.trim();
}
