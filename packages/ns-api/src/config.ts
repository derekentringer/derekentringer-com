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
      "ANTHROPIC_API_KEY",
      "VOYAGE_API_KEY",
      "OPENAI_API_KEY",
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
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3005",
    port: Number(process.env.PORT) || 3004,
    nodeEnv,
    isProduction,
    databaseUrl: process.env.DATABASE_URL || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    voyageApiKey: process.env.VOYAGE_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    appUrl: process.env.APP_URL || "http://localhost:3005",
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
  anthropicApiKey: string;
  voyageApiKey: string;
  openaiApiKey: string;
  resendApiKey: string;
  appUrl: string;
}

/** Reset cached config (for testing only) */
export function resetConfig(): void {
  cachedConfig = null;
}
