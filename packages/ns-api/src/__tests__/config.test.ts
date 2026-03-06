import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, resetConfig } from "../config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it("returns default values in development mode", () => {
    process.env.NODE_ENV = "development";

    const config = loadConfig();

    expect(config.jwtSecret).toBe("dev-jwt-secret-do-not-use-in-prod");
    expect(config.refreshTokenSecret).toBe("dev-refresh-secret-do-not-use-in-prod");
    expect(config.corsOrigin).toBe("http://localhost:3005");
    expect(config.port).toBe(3004);
    expect(config.nodeEnv).toBe("development");
    expect(config.isProduction).toBe(false);
    expect(config.openaiApiKey).toBe("");
    expect(config.resendApiKey).toBe("");
    expect(config.appUrl).toBe("http://localhost:3005");
    expect(config.rpId).toBe("localhost");
    expect(config.rpName).toBe("NoteSync");
  });

  it("returns custom values from env vars", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "custom-jwt-secret";
    process.env.CORS_ORIGIN = "https://example.com";
    process.env.PORT = "9999";

    const config = loadConfig();

    expect(config.jwtSecret).toBe("custom-jwt-secret");
    expect(config.corsOrigin).toBe("https://example.com");
    expect(config.port).toBe(9999);
  });

  it("identifies production environment", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "secret";
    process.env.REFRESH_TOKEN_SECRET = "refresh-secret";
    process.env.CORS_ORIGIN = "https://app.example.com";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    process.env.VOYAGE_API_KEY = "pa-test-voyage-key";
    process.env.OPENAI_API_KEY = "sk-test-openai-key";

    const config = loadConfig();

    expect(config.isProduction).toBe(true);
    expect(config.nodeEnv).toBe("production");
  });

  it("throws in production when required env vars are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.REFRESH_TOKEN_SECRET;

    expect(() => loadConfig()).toThrow("Missing required environment variable");
  });

  it("does not throw in test mode for missing env vars", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    delete process.env.REFRESH_TOKEN_SECRET;

    expect(() => loadConfig()).not.toThrow();
  });

  it("caches config on subsequent calls", () => {
    process.env.NODE_ENV = "development";

    const config1 = loadConfig();
    process.env.CORS_ORIGIN = "https://changed.example.com";
    const config2 = loadConfig();

    expect(config1).toBe(config2);
    expect(config2.corsOrigin).toBe(config1.corsOrigin);
  });

  it("resets cache with resetConfig", () => {
    process.env.NODE_ENV = "development";
    process.env.CORS_ORIGIN = "https://first.example.com";

    const config1 = loadConfig();
    expect(config1.corsOrigin).toBe("https://first.example.com");

    resetConfig();
    process.env.CORS_ORIGIN = "https://second.example.com";

    const config2 = loadConfig();
    expect(config2.corsOrigin).toBe("https://second.example.com");
  });
});
