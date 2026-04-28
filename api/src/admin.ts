import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { startPoller, stopPoller, setTokenMint, runHolderFetch } from "./poller.js";
import { runtime } from "./runtime.js";

const sessions = new Map<string, number>();

function secureEqual(a: string, b: string): boolean {
  const A = Buffer.from(a, "utf-8");
  const B = Buffer.from(b, "utf-8");
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const token = bearerToken(req);
  if (!token) {
    void reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  const createdAt = sessions.get(token);
  if (!createdAt || Date.now() - createdAt > config.sessionTtlMs) {
    sessions.delete(token);
    void reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/admin/login", async (req, reply) => {
    if (!config.adminPassword) {
      return reply.code(503).send({ error: "Set ADMIN_PASSWORD on API service" });
    }
    const body = (req.body ?? {}) as { password?: string };
    if (!secureEqual(body.password ?? "", config.adminPassword)) {
      return reply.code(401).send({ error: "invalid_password" });
    }
    const token = randomBytes(32).toString("hex");
    sessions.set(token, Date.now());
    return { token, expiresInMs: config.sessionTtlMs };
  });

  app.get("/api/admin/status", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return {
      tokenMint: runtime.tokenMint,
      pollRunning: runtime.pollRunning,
      holderPollMs: config.holderPollMs,
      lastAttemptUnix: runtime.lastAttemptUnix,
      lastSuccessUnix: runtime.lastSuccessUnix,
      lastError: runtime.snapshot.error,
      source: runtime.snapshot.source,
      holdersCount: runtime.snapshot.items.length,
      blacklistAddresses: runtime.blacklistAddresses,
    };
  });

  app.post("/api/admin/config", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const body = (req.body ?? {}) as { tokenMint?: string };
    const tokenMint = (body.tokenMint ?? "").trim();
    if (tokenMint && (tokenMint.length < 32 || tokenMint.length > 44)) {
      return reply.code(400).send({ error: "invalid_token_mint" });
    }
    setTokenMint(tokenMint);
    await runHolderFetch();
    return { ok: true, tokenMint: runtime.tokenMint };
  });

  app.post("/api/admin/system/start", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    await startPoller();
    return { ok: true, pollRunning: runtime.pollRunning };
  });

  app.post("/api/admin/system/stop", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    stopPoller();
    return { ok: true, pollRunning: runtime.pollRunning };
  });

  app.post("/api/admin/blacklist", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const body = (req.body ?? {}) as { addresses?: unknown };
    if (!Array.isArray(body.addresses)) {
      return reply.code(400).send({ error: "addresses_must_be_array" });
    }
    const addresses = body.addresses
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean);
    runtime.blacklistAddresses = Array.from(new Set(addresses));
    return { ok: true, blacklistAddresses: runtime.blacklistAddresses };
  });
}
