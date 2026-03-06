import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { loadConfig } from "../config.js";
import { getUserByEmail, getUserById } from "../store/userStore.js";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from "../store/refreshTokenStore.js";
import { toUserResponse } from "../lib/mappers.js";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  RevokeAllSessionsResponse,
} from "@derekentringer/shared";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

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
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string" },
      password: { type: "string" },
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
      const { email, password } = request.body;

      // Look up user by email; use dummy hash if not found to prevent timing attacks
      const DUMMY_HASH = "$2b$10$0000000000000000000000000000000000000000000000000000";
      const user = await getUserByEmail(email);
      const hashToCompare = user ? user.passwordHash : DUMMY_HASH;
      const isPasswordValid = await bcrypt.compare(password, hashToCompare);

      if (!user || !isPasswordValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      try {
        // Check if TOTP is enabled — return partial auth for 2FA
        if (user.totpEnabled) {
          const totpToken = fastify.jwt.sign(
            { sub: user.id, email: user.email, role: user.role, type: "totp-pending" },
            { expiresIn: "5m" },
          );
          return reply.send({
            requiresTotp: true,
            totpToken,
          });
        }

        // Check if password change is required
        if (user.mustChangePassword) {
          const limitedToken = fastify.jwt.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: "15m" },
          );
          return reply.send({
            accessToken: limitedToken,
            expiresIn: 900,
            mustChangePassword: true,
            user: toUserResponse(user),
          });
        }

        // Full login
        const accessToken = fastify.jwt.sign({
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        const refreshToken = crypto.randomBytes(32).toString("hex");
        await storeRefreshToken(refreshToken, user.id);

        reply.setCookie("refreshToken", refreshToken, refreshCookieOptions(config.nodeEnv));

        const response: LoginResponse = {
          accessToken,
          expiresIn: 900,
          user: toUserResponse(user),
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
      const token = request.cookies?.refreshToken;

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

        // Look up user to get current email/role for JWT
        const user = await getUserById(stored.userId);
        if (!user) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "User not found",
          });
        }

        await revokeRefreshToken(token);

        const newRefreshToken = crypto.randomBytes(32).toString("hex");
        await storeRefreshToken(newRefreshToken, stored.userId);

        const accessToken = fastify.jwt.sign({
          sub: user.id,
          email: user.email,
          role: user.role,
        });

        reply.setCookie("refreshToken", newRefreshToken, refreshCookieOptions(config.nodeEnv));

        const response: RefreshResponse = {
          accessToken,
          expiresIn: 900,
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

  // GET /me — return current user profile
  fastify.get(
    "/me",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await getUserById(request.user.sub);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      return reply.send({ user: toUserResponse(user) });
    },
  );

  // POST /logout
  fastify.post(
    "/logout",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = request.cookies?.refreshToken;
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

  // POST /sessions/revoke-all
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
}
