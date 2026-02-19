import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import authPlugin from "@derekentringer/shared/auth";
import { loadConfig } from "./config.js";
import { initEncryptionKey } from "./lib/encryption.js";
import { getPrisma } from "./lib/prisma.js";
import { cleanupExpiredTokens } from "./store/refreshTokenStore.js";
import { seedDefaultCategories } from "./store/categoryStore.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/accounts.js";
import categoryRoutes from "./routes/categories.js";
import categoryRuleRoutes from "./routes/categoryRules.js";
import transactionRoutes from "./routes/transactions.js";
import balanceRoutes from "./routes/balances.js";
import budgetRoutes from "./routes/budgets.js";
import billRoutes from "./routes/bills.js";
import dashboardRoutes from "./routes/dashboard.js";

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
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1,
    },
  });
  app.register(authPlugin, {
    jwtSecret: config.jwtSecret,
  });

  // Global error handler — never leak internal details to clients
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

    // 4xx errors from schema validation etc. are safe to return
    return reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: error.message,
    });
  });

  app.register(authRoutes, { prefix: "/auth" });
  app.register(accountRoutes, { prefix: "/accounts" });
  app.register(categoryRoutes, { prefix: "/categories" });
  app.register(categoryRuleRoutes, { prefix: "/category-rules" });
  app.register(transactionRoutes, { prefix: "/transactions" });
  app.register(balanceRoutes, { prefix: "/balances" });
  app.register(budgetRoutes, { prefix: "/budgets" });
  app.register(billRoutes, { prefix: "/bills" });
  app.register(dashboardRoutes, { prefix: "/dashboard" });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Periodic cleanup of expired refresh tokens
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  app.addHook("onReady", async () => {
    cleanupExpiredTokens().catch(() => {});
    seedDefaultCategories().catch(() => {});
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
