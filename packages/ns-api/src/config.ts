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
    // Whisper provider — `openai` (default), `groq`, or `custom`.
    // Groq hosts whisper-large-v3-turbo on LPU hardware and is
    // ~6.7× cheaper than OpenAI's $0.006/min while running the
    // same model. `custom` lets us point at any Whisper-compatible
    // endpoint (e.g. self-hosted whisper.cpp behind an HTTP shim)
    // by setting WHISPER_API_URL + WHISPER_API_KEY + WHISPER_MODEL
    // explicitly. Defaults preserve current behavior so existing
    // deployments keep working.
    whisperProvider:
      (process.env.WHISPER_PROVIDER as Config["whisperProvider"]) || "openai",
    whisperApiUrl:
      process.env.WHISPER_API_URL ||
      (process.env.WHISPER_PROVIDER === "groq"
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions"),
    whisperApiKey:
      process.env.WHISPER_API_KEY ||
      (process.env.WHISPER_PROVIDER === "groq"
        ? process.env.GROQ_API_KEY || ""
        : process.env.OPENAI_API_KEY || ""),
    whisperModel:
      process.env.WHISPER_MODEL ||
      (process.env.WHISPER_PROVIDER === "groq"
        ? "whisper-large-v3-turbo"
        : "whisper-1"),
    resendApiKey: process.env.RESEND_API_KEY || "",
    appUrl: process.env.APP_URL || "http://localhost:3005",
    r2AccountId: process.env.R2_ACCOUNT_ID || "",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    r2BucketName: process.env.R2_BUCKET_NAME || "",
    r2PublicUrl: process.env.R2_PUBLIC_URL || "",
    claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
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
  /** Whisper inference provider. Switch via WHISPER_PROVIDER. */
  whisperProvider: "openai" | "groq" | "custom";
  /** Whisper-compatible HTTP endpoint. Set explicitly for "custom". */
  whisperApiUrl: string;
  /** Bearer token for the Whisper endpoint. Falls back to
   *  OPENAI_API_KEY for openai and GROQ_API_KEY for groq when
   *  WHISPER_API_KEY is unset. */
  whisperApiKey: string;
  /** Model id sent in the multipart `model` field. */
  whisperModel: string;
  resendApiKey: string;
  appUrl: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  claudeModel: string;
}

/** Reset cached config (for testing only) */
export function resetConfig(): void {
  cachedConfig = null;
}
