import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { startPoller } from "./poller.js";
import { registerAdminRoutes } from "./admin.js";
import { runtime } from "./runtime.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.corsOrigin,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.get("/health", async () => ({ ok: true }));

app.get("/api/status", async () => ({
  pollRunning: runtime.pollRunning,
  tokenMint: runtime.tokenMint || null,
  source: runtime.snapshot.source,
  lastAttemptUnix: runtime.lastAttemptUnix,
  lastSuccessUnix: runtime.lastSuccessUnix,
  lastError: runtime.snapshot.error,
  holdersCount: runtime.snapshot.items.length,
}));

app.get("/api/holders", async () => {
  const now = Math.floor(Date.now() / 1000);
  const blacklist = new Set(runtime.blacklistAddresses.map((a) => a.toLowerCase()));
  const items = runtime.snapshot.items
    .filter((row) => !blacklist.has(row.address.toLowerCase()))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
  const activeHolders = items.length;
  const avgHoldDays =
    activeHolders > 0
      ? items.reduce((sum, row) => sum + Math.max(0, now - row.heldSinceUnix), 0) / activeHolders / 86400
      : 0;
  const nextDistributionUnix = Math.ceil(now / 1800) * 1800;
  return {
    source: runtime.snapshot.source,
    fetchedAtUnix: runtime.snapshot.fetchedAtUnix,
    error: runtime.snapshot.error,
    tokenMint: runtime.tokenMint || null,
    stats: {
      activeHolders,
      avgHoldDays,
      totalDistributedSol: 0,
      nextDistributionUnix,
    },
    items,
  };
});

await registerAdminRoutes(app);
await startPoller();

await app.listen({ port: config.port, host: "0.0.0.0" });
