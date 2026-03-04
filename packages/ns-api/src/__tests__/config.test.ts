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

    expect(config.adminUsername).toBe("admin");
    expect(config.jwtSecret).toBe("dev-jwt-secret-do-not-use-in-prod");
    expect(config.refreshTokenSecret).toBe("dev-refresh-secret-do-not-use-in-prod");
    expect(config.corsOrigin).toBe("http://localhost:3005");
    expect(config.port).toBe(3004);
    expect(config.nodeEnv).toBe("development");
    expect(config.isProduction).toBe(false);
    expect(config.openaiApiKey).toBe("");
  });

  it("returns custom values from env vars", () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_USERNAME = "custom-admin";
    process.env.JWT_SECRET = "custom-jwt-secret";
    process.env.CORS_ORIGIN = "https://example.com";
    process.env.PORT = "9999";

    const config = loadConfig();

    expect(config.adminUsername).toBe("custom-admin");
    expect(config.jwtSecret).toBe("custom-jwt-secret");
    expect(config.corsOrigin).toBe("https://example.com");
    expect(config.port).toBe(9999);
  });

  it("identifies production environment", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = "hash";
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
    delete process.env.ADMIN_USERNAME;
    delete process.env.JWT_SECRET;

    expect(() => loadConfig()).toThrow("Missing required environment variable");
  });

  it("does not throw in test mode for missing env vars", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ADMIN_USERNAME;
    delete process.env.JWT_SECRET;

    expect(() => loadConfig()).not.toThrow();
  });

  it("caches config on subsequent calls", () => {
    process.env.NODE_ENV = "development";

    const config1 = loadConfig();
    process.env.ADMIN_USERNAME = "changed";
    const config2 = loadConfig();

    expect(config1).toBe(config2);
    expect(config2.adminUsername).toBe(config1.adminUsername);
  });

  it("resets cache with resetConfig", () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_USERNAME = "first";

    const config1 = loadConfig();
    expect(config1.adminUsername).toBe("first");

    resetConfig();
    process.env.ADMIN_USERNAME = "second";

    const config2 = loadConfig();
    expect(config2.adminUsername).toBe("second");
  });
});
