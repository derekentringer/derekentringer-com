let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase().trim();
  const isProduction = nodeEnv === "production";

  const enforceSecrets = nodeEnv !== "development" && nodeEnv !== "test";

  if (enforceSecrets) {
    const required = [
      "JWT_SECRET",
      "REFRESH_TOKEN_SECRET",
      "CORS_ORIGIN",
      "DATABASE_URL",
      "ENCRYPTION_KEY",
    ];
    for (const name of required) {
      if (!process.env[name]) {
        throw new Error(`Missing required environment variable: ${name}`);
      }
    }
  }

  cachedConfig = {
    jwtSecret:
      process.env.JWT_SECRET || "dev-jwt-secret-do-not-use-in-prod",
    refreshTokenSecret:
      process.env.REFRESH_TOKEN_SECRET ||
      "dev-refresh-secret-do-not-use-in-prod",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3003",
    port: Number(process.env.PORT) || 3002,
    nodeEnv,
    isProduction,
    databaseUrl: process.env.DATABASE_URL || "",
    encryptionKey: process.env.ENCRYPTION_KEY || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    appUrl: process.env.APP_URL || "http://localhost:3003",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    fredApiKey: process.env.FRED_API_KEY || "",
    finnhubApiKey: process.env.FINNHUB_API_KEY || "",
    priceFetchHour: Number(process.env.PRICE_FETCH_HOUR) || 18,
    fcmProjectId: process.env.FIREBASE_PROJECT_ID || "",
    fcmClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    fcmPrivateKey: process.env.FIREBASE_PRIVATE_KEY || "",
  };

  return cachedConfig;
}

export interface Config {
  jwtSecret: string;
  refreshTokenSecret: string;
  corsOrigin: string;
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  databaseUrl: string;
  encryptionKey: string;
  resendApiKey: string;
  appUrl: string;
  anthropicApiKey: string;
  fredApiKey: string;
  finnhubApiKey: string;
  priceFetchHour: number;
  fcmProjectId: string;
  fcmClientEmail: string;
  fcmPrivateKey: string;
}

/** Reset cached config (for testing only) */
export function resetConfig(): void {
  cachedConfig = null;
}
