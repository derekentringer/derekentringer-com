import crypto from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { loadConfig } from "../config.js";
import { getUserByEmail, getUserById, createUser, updateUser } from "../store/userStore.js";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from "../store/refreshTokenStore.js";
import {
  createPasswordResetToken,
  lookupPasswordResetToken,
  deletePasswordResetTokens,
} from "../store/passwordResetStore.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import { getSetting } from "../store/settingStore.js";
import { toUserResponse } from "../lib/mappers.js";
import { validatePasswordStrength } from "@derekentringer/shared";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  RevokeAllSessionsResponse,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
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

  // POST /register
  fastify.post<{ Body: RegisterRequest }>(
    "/register",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
            displayName: { type: "string" },
          },
        },
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 hour",
        },
      },
    },
    async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
      const { email, password, displayName } = request.body;

      // Check approved emails list
      const approvedRaw = await getSetting("approvedEmails");
      if (!approvedRaw) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Registration is not currently open",
        });
      }

      const approvedEmails = approvedRaw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (!approvedEmails.includes(email.toLowerCase())) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Email not approved for registration",
        });
      }

      // Validate password strength
      const validation = validatePasswordStrength(password);
      if (!validation.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: validation.errors.join("; "),
        });
      }

      // Check for existing user
      const existing = await getUserByEmail(email);
      if (existing) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "An account with this email already exists",
        });
      }

      try {
        const user = await createUser({ email, password, displayName });

        // Auto-login
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

        return reply.status(201).send(response);
      } catch (e) {
        request.log.error(e, "Failed to register user");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to register",
        });
      }
    },
  );

  // POST /forgot-password
  fastify.post<{ Body: ForgotPasswordRequest }>(
    "/forgot-password",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["email"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request: FastifyRequest<{ Body: ForgotPasswordRequest }>, reply: FastifyReply) => {
      const { email } = request.body;

      // Always return 200 to prevent email enumeration
      const user = await getUserByEmail(email);

      if (user) {
        try {
          const rawToken = await createPasswordResetToken(user.id);
          await sendPasswordResetEmail(user.email, rawToken, config.appUrl);
        } catch (e) {
          request.log.error(e, "Failed to send password reset email");
        }
      }

      return reply.send({
        message: "If an account exists with that email, a reset link has been sent",
      });
    },
  );

  // POST /reset-password
  fastify.post<{ Body: ResetPasswordRequest }>(
    "/reset-password",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["token", "newPassword"],
          additionalProperties: false,
          properties: {
            token: { type: "string" },
            newPassword: { type: "string" },
          },
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request: FastifyRequest<{ Body: ResetPasswordRequest }>, reply: FastifyReply) => {
      const { token, newPassword } = request.body;

      const result = await lookupPasswordResetToken(token);
      if (!result) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired reset token",
        });
      }

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: validation.errors.join("; "),
        });
      }

      try {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await updateUser(result.userId, { passwordHash, mustChangePassword: false });
        await deletePasswordResetTokens(result.userId);
        await revokeAllRefreshTokens(result.userId);

        return reply.send({ message: "Password has been reset successfully" });
      } catch (e) {
        request.log.error(e, "Failed to reset password");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to reset password",
        });
      }
    },
  );

  // POST /change-password (authenticated)
  fastify.post<{ Body: ChangePasswordRequest }>(
    "/change-password",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object" as const,
          required: ["currentPassword", "newPassword"],
          additionalProperties: false,
          properties: {
            currentPassword: { type: "string" },
            newPassword: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChangePasswordRequest }>, reply: FastifyReply) => {
      const { currentPassword, newPassword } = request.body;
      const userId = request.user.sub;

      const user = await getUserById(userId);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Current password is incorrect",
        });
      }

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: validation.errors.join("; "),
        });
      }

      try {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await updateUser(userId, { passwordHash, mustChangePassword: false });

        // Revoke other sessions but keep current one
        await revokeAllRefreshTokens(userId);

        return reply.send({ message: "Password changed successfully" });
      } catch (e) {
        request.log.error(e, "Failed to change password");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to change password",
        });
      }
    },
  );
}
