import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "@derekentringer/shared/auth";
import { loadConfig } from "./config.js";
import authRoutes from "./routes/auth.js";

export interface BuildAppOptions {
  disableRateLimit?: boolean;
}

export function buildApp(opts?: BuildAppOptions) {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  app.register(cookie);
  app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });
  if (!opts?.disableRateLimit) {
    app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
    });
  }
  app.register(authPlugin, {
    jwtSecret: config.jwtSecret,
  });

  app.register(authRoutes, { prefix: "/auth" });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
