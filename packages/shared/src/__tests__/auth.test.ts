import { describe, it, expect, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import authPlugin from "../auth/index.js";

const JWT_SECRET = "test-secret-for-auth-plugin-tests";

describe("auth plugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    app.register(authPlugin, { jwtSecret: JWT_SECRET });

    app.after(() => {
      app.get(
        "/protected",
        { onRequest: [app.authenticate] },
        async (request) => {
          return { user: request.user };
        },
      );
    });

    app.get("/public", async () => {
      return { message: "public" };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });

  it("returns 200 with a valid token", async () => {
    const token = app.jwt.sign({ sub: "admin", username: "admin" });

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toMatchObject({ sub: "admin", username: "admin" });
  });

  it("rejects a tampered token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer invalid.token.here" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const token = app.jwt.sign(
      { sub: "admin", username: "admin" },
      { expiresIn: "1s" },
    );

    // Wait for token to expire (cross the 1-second boundary)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("allows access to public routes without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "public" });
  });
});
