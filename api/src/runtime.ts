import { config } from "./config.js";
import type { HolderSnapshot } from "./types.js";

export const runtime = {
  tokenMint: config.tokenMint,
  pollRunning: false,
  pollInterval: null as NodeJS.Timeout | null,
  snapshot: {
    items: [],
    source: "mock",
    fetchedAtUnix: null,
    error: "No snapshot fetched yet",
  } as HolderSnapshot,
  lastAttemptUnix: null as number | null,
  lastSuccessUnix: null as number | null,
  blacklistAddresses: [] as string[],
  cycleStartedAtUnix: null as number | null,
};
