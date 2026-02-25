import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { loadConfig } from "../config.js";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from "../store/refreshTokenStore.js";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  PinVerifyRequest,
  PinVerifyResponse,
  LogoutResponse,
  RevokeAllSessionsResponse,
} from "@derekentringer/shared";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const ADMIN_USER_ID = "admin-001";

function isMobileClient(request: FastifyRequest): boolean {
  return request.headers["x-client-type"] === "mobile";
}

function refreshCookieOptions(nodeEnv: string) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "strict" as const,
    path: "/auth/refresh",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

const loginSchema = {
  body: {
    type: "object" as const,
    required: ["username", "password"],
    additionalProperties: false,
    properties: {
      username: { type: "string" },
      password: { type: "string" },
    },
  },
};

const pinVerifySchema = {
  body: {
    type: "object" as const,
    required: ["pin"],
    additionalProperties: false,
    properties: {
      pin: { type: "string" },
    },
  },
};

export default async function authRoutes(fastify: FastifyInstance) {
  const config = loadConfig();

  // POST /login
  fastify.post<{ Body: LoginRequest }>(
    "/login",
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { username, password } = request.body;

      // Always run bcrypt.compare to prevent timing-based username enumeration.
      // Use a dummy hash when username doesn't match so both paths take equal time.
      const DUMMY_HASH = "$2b$10$0000000000000000000000000000000000000000000000000000";
      const isUsernameValid = username === config.adminUsername;
      const hashToCompare = isUsernameValid ? config.adminPasswordHash : DUMMY_HASH;
      const isPasswordValid = await bcrypt.compare(password, hashToCompare);

      if (!isUsernameValid || !isPasswordValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      try {
        const now = new Date().toISOString();
        const accessToken = fastify.jwt.sign({
          sub: ADMIN_USER_ID,
          username: config.adminUsername,
        });

        const refreshToken = crypto.randomBytes(32).toString("hex");
        await storeRefreshToken(refreshToken, ADMIN_USER_ID);

        reply.setCookie("refreshToken", refreshToken, refreshCookieOptions(config.nodeEnv));

        const response: LoginResponse = {
          accessToken,
          expiresIn: 900,
          user: {
            id: ADMIN_USER_ID,
            username: config.adminUsername,
            createdAt: now,
            updatedAt: now,
          },
          ...(isMobileClient(request) && { refreshToken }),
        };

        return reply.send(response);
      } catch (e) {
        request.log.error(e, "Failed to complete login");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to complete login",
        });
      }
    },
  );

  // POST /refresh
  fastify.post(
    "/refresh",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token =
        request.cookies?.refreshToken ||
        (request.body as { refreshToken?: string })?.refreshToken;

      if (!token) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "No refresh token provided",
        });
      }

      try {
        const stored = await lookupRefreshToken(token);
        if (!stored) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid or expired refresh token",
          });
        }

        // Rotate: revoke old, create new
        await revokeRefreshToken(token);

        const newRefreshToken = crypto.randomBytes(32).toString("hex");
        await storeRefreshToken(newRefreshToken, stored.userId);

        const accessToken = fastify.jwt.sign({
          sub: stored.userId,
          username: stored.userId === ADMIN_USER_ID ? config.adminUsername : stored.userId,
        });

        reply.setCookie("refreshToken", newRefreshToken, refreshCookieOptions(config.nodeEnv));

        const response: RefreshResponse = {
          accessToken,
          expiresIn: 900,
          ...(isMobileClient(request) && { refreshToken: newRefreshToken }),
        };

        return reply.send(response);
      } catch (e) {
        request.log.error(e, "Failed to refresh token");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to refresh token",
        });
      }
    },
  );

  // POST /logout
  fastify.post(
    "/logout",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token =
          request.cookies?.refreshToken ||
          (request.body as { refreshToken?: string })?.refreshToken;
        if (token) {
          await revokeRefreshToken(token);
        }

        reply.clearCookie("refreshToken", {
          path: "/auth/refresh",
        });

        const response: LogoutResponse = {
          message: "Logged out successfully",
        };

        return reply.send(response);
      } catch (e) {
        request.log.error(e, "Failed to logout");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to logout",
        });
      }
    },
  );

  // POST /sessions/revoke-all — revoke all refresh tokens for current user
  fastify.post(
    "/sessions/revoke-all",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const revokedCount = await revokeAllRefreshTokens(request.user.sub);

        reply.clearCookie("refreshToken", {
          path: "/auth/refresh",
        });

        const response: RevokeAllSessionsResponse = {
          revokedCount,
          message: `Revoked ${revokedCount} session(s)`,
        };

        return reply.send(response);
      } catch (e) {
        request.log.error(e, "Failed to revoke all sessions");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to revoke sessions",
        });
      }
    },
  );

  // POST /pin/verify — only if PIN_HASH is configured
  if (config.pinHash) {
    fastify.post<{ Body: PinVerifyRequest }>(
      "/pin/verify",
      {
        schema: pinVerifySchema,
        onRequest: [fastify.authenticate],
        config: {
          rateLimit: {
            max: 5,
            timeWindow: "15 minutes",
          },
        },
      },
      async (
        request: FastifyRequest<{ Body: PinVerifyRequest }>,
        reply: FastifyReply,
      ) => {
        const { pin } = request.body;

        const valid = await bcrypt.compare(pin, config.pinHash!);
        if (!valid) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid PIN",
          });
        }

        const user = request.user;
        // Pin tokens use a different payload shape than access tokens
        const pinToken = fastify.jwt.sign(
          { sub: user.sub, type: "pin" } as unknown as { sub: string; username: string },
          { key: config.pinTokenSecret, expiresIn: 900 },
        );

        const response: PinVerifyResponse = {
          pinToken,
          expiresIn: 900,
        };

        return reply.send(response);
      },
    );
  }
}
