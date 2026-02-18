import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { loadConfig } from "../config.js";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
} from "../store/refreshTokenStore.js";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  PinVerifyRequest,
  PinVerifyResponse,
  LogoutResponse,
} from "@derekentringer/shared";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const ADMIN_USER_ID = "admin-001";

function refreshCookieOptions(nodeEnv: string) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "strict" as const,
    path: "/auth/refresh",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  const config = loadConfig();

  // POST /login
  fastify.post<{ Body: LoginRequest }>(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { username, password } = request.body || {};

      if (!username || !password) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Username and password are required",
        });
      }

      if (username !== config.adminUsername) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      const valid = await bcrypt.compare(password, config.adminPasswordHash);
      if (!valid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

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
      };

      return reply.send(response);
    },
  );

  // POST /refresh
  fastify.post(
    "/refresh",
    {
      config: {
        rateLimit: {
          max: 10,
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
      };

      return reply.send(response);
    },
  );

  // POST /logout
  fastify.post(
    "/logout",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
  );

  // POST /pin/verify — only if PIN_HASH is configured
  if (config.pinHash) {
    fastify.post<{ Body: PinVerifyRequest }>(
      "/pin/verify",
      {
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
        const { pin } = request.body || {};

        if (!pin) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "PIN is required",
          });
        }

        const valid = await bcrypt.compare(pin, config.pinHash!);
        if (!valid) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid PIN",
          });
        }

        const user = request.user;
        const pinToken = jwt.sign(
          { sub: user.sub, type: "pin" },
          config.pinTokenSecret,
          { expiresIn: 300 },
        );

        const response: PinVerifyResponse = {
          pinToken,
          expiresIn: 300,
        };

        return reply.send(response);
      },
    );
  }
}
