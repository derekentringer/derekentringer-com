import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "../app.js";

describe("GET /health", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it("returns status ok", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
