import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "@derekentringer/shared/auth";
import { loadConfig } from "./config.js";
import { initEncryptionKey } from "./lib/encryption.js";
import { getPrisma } from "./lib/prisma.js";
import { cleanupExpiredTokens } from "./store/refreshTokenStore.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/accounts.js";

const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface BuildAppOptions {
  disableRateLimit?: boolean;
}

export function buildApp(opts?: BuildAppOptions) {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  if (config.encryptionKey) {
    initEncryptionKey(config.encryptionKey);
  }

  app.register(cookie);
  app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });
  app.register(helmet, {
    contentSecurityPolicy: config.isProduction,
  });
  if (!opts?.disableRateLimit) {
    app.register(rateLimit, {
      max: 60,
      timeWindow: "1 minute",
    });
  }
  app.register(authPlugin, {
    jwtSecret: config.jwtSecret,
  });

  app.register(authRoutes, { prefix: "/auth" });
  app.register(accountRoutes, { prefix: "/accounts" });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Periodic cleanup of expired refresh tokens
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  app.addHook("onReady", async () => {
    cleanupExpiredTokens().catch(() => {});
    cleanupTimer = setInterval(() => {
      cleanupExpiredTokens().catch(() => {});
    }, TOKEN_CLEANUP_INTERVAL_MS);
  });

  app.addHook("onClose", async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
    await getPrisma().$disconnect();
  });

  return app;
}
