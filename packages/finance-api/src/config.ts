export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  if (isProduction) {
    const required = [
      "ADMIN_PASSWORD_HASH",
      "JWT_SECRET",
      "REFRESH_TOKEN_SECRET",
      "DATABASE_URL",
      "ENCRYPTION_KEY",
    ];
    for (const name of required) {
      if (!process.env[name]) {
        throw new Error(`Missing required environment variable: ${name}`);
      }
    }
  }

  return {
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    jwtSecret:
      process.env.JWT_SECRET || "dev-jwt-secret-do-not-use-in-prod",
    refreshTokenSecret:
      process.env.REFRESH_TOKEN_SECRET ||
      "dev-refresh-secret-do-not-use-in-prod",
    pinHash: process.env.PIN_HASH || null,
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3003",
    port: Number(process.env.PORT) || 3002,
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL || "",
    encryptionKey: process.env.ENCRYPTION_KEY || "",
  };
}

export type Config = ReturnType<typeof loadConfig>;
