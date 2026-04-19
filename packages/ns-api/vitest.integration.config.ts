import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/integration/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    globalSetup: ["./src/__tests__/integration/globalSetup.ts"],
    // Testcontainer startup + migrations can take ~15s on first run;
    // per-test operations are fast.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Run integration tests serially so they don't contend on the same
    // test DB. Parallelism can come later with per-worker schemas if needed.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
