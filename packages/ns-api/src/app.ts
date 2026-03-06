import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "@derekentringer/shared/auth";
import { loadConfig } from "./config.js";
import { getPrisma } from "./lib/prisma.js";
import { cleanupExpiredTokens } from "./store/refreshTokenStore.js";
import { purgeOldTrash } from "./store/noteStore.js";
import { getTrashRetentionDays } from "./store/settingStore.js";
import { startEmbeddingProcessor } from "./services/embeddingProcessor.js";
import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import noteRoutes from "./routes/notes.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.js";
import totpRoutes from "./routes/totp.js";
import passkeyRoutes from "./routes/passkey.js";

const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface BuildAppOptions {
  disableRateLimit?: boolean;
}

export function buildApp(opts?: BuildAppOptions) {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  app.register(cookie);
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === config.corsOrigin) return cb(null, true);
      cb(new Error("Not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  if (!opts?.disableRateLimit) {
    app.register(rateLimit, {
      max: 200,
      timeWindow: "1 minute",
    });
  }
  app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  app.register(authPlugin, {
    jwtSecret: config.jwtSecret,
  });

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        statusCode,
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: error.message,
    });
  });

  app.register(authRoutes, { prefix: "/auth" });
  app.register(healthRoutes);
  app.register(noteRoutes, { prefix: "/notes" });
  app.register(aiRoutes, { prefix: "/ai" });
  app.register(adminRoutes, { prefix: "/admin" });
  app.register(totpRoutes, { prefix: "/auth/totp" });
  app.register(passkeyRoutes, { prefix: "/auth/passkeys" });

  app.get("/robots.txt", async (_request, reply) => {
    reply.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  let embeddingProcessor: { stop: () => void } | null = null;

  async function runTrashPurge() {
    const days = await getTrashRetentionDays();
    if (days > 0) {
      await purgeOldTrash(days);
    }
  }

  app.addHook("onReady", async () => {
    cleanupExpiredTokens().catch(() => {});
    runTrashPurge().catch(() => {});
    cleanupTimer = setInterval(() => {
      cleanupExpiredTokens().catch(() => {});
      runTrashPurge().catch(() => {});
    }, TOKEN_CLEANUP_INTERVAL_MS);
    embeddingProcessor = startEmbeddingProcessor();
  });

  app.addHook("onClose", async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
    if (embeddingProcessor) embeddingProcessor.stop();
    await getPrisma().$disconnect();
  });

  return app;
}
