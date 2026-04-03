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
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
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
    corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:3005")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3005")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0],
    port: Number(process.env.PORT) || 3004,
    nodeEnv,
    isProduction,
    databaseUrl: process.env.DATABASE_URL || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    voyageApiKey: process.env.VOYAGE_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    appUrl: process.env.APP_URL || "http://localhost:3005",
    r2AccountId: process.env.R2_ACCOUNT_ID || "",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    r2BucketName: process.env.R2_BUCKET_NAME || "",
    r2PublicUrl: process.env.R2_PUBLIC_URL || "",
  };

  return cachedConfig;
}

export interface Config {
  jwtSecret: string;
  refreshTokenSecret: string;
  corsOrigins: string[];
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
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
}

/** Reset cached config (for testing only) */
export function resetConfig(): void {
  cachedConfig = null;
}
