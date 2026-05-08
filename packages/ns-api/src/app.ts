import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "@derekentringer/shared/auth";
import { loadConfig } from "./config.js";
import { getPrisma } from "./lib/prisma.js";
import { createSseHub, type SseHub } from "./lib/sseHub.js";
import { initTranscriptionWorker } from "./services/transcriptionWorker.js";
import { reconcileAllOrphanMeetingCards } from "./store/chatStore.js";
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
import syncRoutes from "./routes/sync.js";
import imageRoutes from "./routes/images.js";
import linkRoutes from "./routes/links.js";


const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

declare module "fastify" {
  interface FastifyInstance {
    sseHub: SseHub;
  }
}

export interface BuildAppOptions {
  disableRateLimit?: boolean;
}

export function buildApp(opts?: BuildAppOptions) {
  const config = loadConfig();
  const app = Fastify({
    logger: true,
    bodyLimit: 500 * 1024 * 1024, // 500 MB — supports long meeting recordings (16kHz WAV ~1.9 MB/min)
  });

  const sseHub = createSseHub();
  app.decorate("sseHub", sseHub);

  // Phase H — wire the in-process transcription worker. The
  // worker is currently a stub (kickDispatcher is a no-op); the
  // real dispatch loop lands in step 3. Initializing here lets
  // the REST endpoints' `kickDispatcher()` calls become no-ops
  // safely until then.
  initTranscriptionWorker({ sseHub, log: app.log });

  // Phase H — periodic orphan-card reconcile sweep. Scans every
  // 60s for `processing` meeting-summary chat cards older than the
  // grace window with no matching transcription_jobs row, flips
  // them to `failed`, and fires `chat` SSE per affected user so
  // their connected devices refetch and show the failed state.
  // Without this, a client that never refetches /ai/chat-history
  // never sees the in-band reconcile that the route handler does.
  const ORPHAN_SWEEP_INTERVAL_MS = 60 * 1000;
  const orphanSweepTimer = setInterval(() => {
    reconcileAllOrphanMeetingCards()
      .then((updated) => {
        if (updated.size === 0) return;
        for (const [userId, count] of updated) {
          sseHub.notifyChat(userId);
          app.log.info(
            { userId, count },
            "Phase H orphan-card sweep — reconciled stuck processing cards",
          );
        }
      })
      .catch((err) =>
        app.log.error({ err }, "Phase H orphan-card sweep failed"),
      );
  }, ORPHAN_SWEEP_INTERVAL_MS);
  if (orphanSweepTimer.unref) orphanSweepTimer.unref();

  app.register(cookie);
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
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
        connectSrc: ["'self'", ...config.corsOrigins],
      },
    },
  });
  if (!opts?.disableRateLimit) {
    app.register(rateLimit, {
      max: 200,
      timeWindow: "1 minute",
      allowList: (request: { url: string }) =>
        request.url.startsWith("/sync/events"),
    });
  }
  app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 1 } });
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
  app.register(syncRoutes, { prefix: "/sync" });
  app.register(imageRoutes, { prefix: "/images" });
  app.register(linkRoutes, { prefix: "/links" });


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
    sseHub.cleanup();
    await getPrisma().$disconnect();
  });

  return app;
}
