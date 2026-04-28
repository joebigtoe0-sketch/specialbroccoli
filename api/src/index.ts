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

app.get("/api/holders", async () => ({
  source: runtime.snapshot.source,
  fetchedAtUnix: runtime.snapshot.fetchedAtUnix,
  error: runtime.snapshot.error,
  items: runtime.snapshot.items,
}));

await registerAdminRoutes(app);
await startPoller();

await app.listen({ port: config.port, host: "0.0.0.0" });
