import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { getUserById, updateUser } from "../store/userStore.js";
import { storeRefreshToken } from "../store/refreshTokenStore.js";
import { loadConfig } from "../config.js";
import { toUserResponse } from "../lib/mappers.js";
import type {
  TotpSetupResponse,
  TotpVerifySetupResponse,
  TotpVerifyRequest,
  LoginResponse,
} from "@derekentringer/shared";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// In-memory store for pending TOTP setup secrets (5min TTL)
const pendingSetups = new Map<string, { secret: string; expiresAt: number }>();

function cleanupPendingSetups() {
  const now = Date.now();
  for (const [key, val] of pendingSetups) {
    if (val.expiresAt < now) pendingSetups.delete(key);
  }
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString("hex"));
  }
  return codes;
}

async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

function createTotp(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "NoteSync",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function verifyTotpCode(secret: string, code: string, email: string): boolean {
  const totp = createTotp(secret, email);
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export default async function totpRoutes(fastify: FastifyInstance) {
  const config = loadConfig();

  function refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict" as const,
      path: "/auth/refresh",
      maxAge: REFRESH_COOKIE_MAX_AGE,
    };
  }

  // POST /auth/totp/setup — generate TOTP secret and QR code (authenticated)
  fastify.post(
    "/setup",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const user = await getUserById(userId);

      if (!user) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "User not found" });
      }

      if (user.totpEnabled) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "2FA is already enabled" });
      }

      cleanupPendingSetups();

      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "NoteSync",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });

      const otpauthUrl = totp.toString();
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      pendingSetups.set(userId, {
        secret: secret.base32,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const response: TotpSetupResponse = { secret: secret.base32, qrCodeDataUrl, otpauthUrl };
      return reply.send(response);
    },
  );

  // POST /auth/totp/verify-setup — verify TOTP code and enable 2FA (authenticated)
  fastify.post<{ Body: { code: string } }>(
    "/verify-setup",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object" as const,
          required: ["code"],
          additionalProperties: false,
          properties: { code: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { code: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { code } = request.body;

      const pending = pendingSetups.get(userId);
      if (!pending || pending.expiresAt < Date.now()) {
        pendingSetups.delete(userId);
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "No pending 2FA setup. Please start setup again." });
      }

      const user = await getUserById(userId);
      if (!user) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "User not found" });
      }

      const isValid = verifyTotpCode(pending.secret, code, user.email);
      if (!isValid) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "Invalid verification code" });
      }

      const backupCodes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(backupCodes);

      await updateUser(userId, {
        totpSecret: pending.secret,
        totpEnabled: true,
        backupCodes: hashedCodes,
      });

      pendingSetups.delete(userId);

      const response: TotpVerifySetupResponse = { backupCodes };
      return reply.send(response);
    },
  );

  // POST /auth/totp/verify — second step of login (unauthenticated)
  fastify.post<{ Body: TotpVerifyRequest }>(
    "/verify",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["totpToken", "code"],
          additionalProperties: false,
          properties: {
            totpToken: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: TotpVerifyRequest }>,
      reply: FastifyReply,
    ) => {
      const { totpToken, code } = request.body;

      // Verify the partial auth token
      let payload: { sub: string; email: string; role: string; type?: string };
      try {
        payload = fastify.jwt.verify(totpToken);
      } catch {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid or expired TOTP token" });
      }

      if (payload.type !== "totp-pending") {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid token type" });
      }

      const user = await getUserById(payload.sub);
      if (!user || !user.totpEnabled || !user.totpSecret) {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid credentials" });
      }

      // Try TOTP code first
      let isValid = verifyTotpCode(user.totpSecret, code, user.email);

      // If not a TOTP code, check backup codes
      if (!isValid && Array.isArray(user.backupCodes)) {
        const backupCodes = user.backupCodes as string[];
        for (let i = 0; i < backupCodes.length; i++) {
          const matches = await bcrypt.compare(code, backupCodes[i]);
          if (matches) {
            // Consume the backup code
            const remaining = [...backupCodes];
            remaining.splice(i, 1);
            await updateUser(user.id, { backupCodes: remaining });
            isValid = true;
            break;
          }
        }
      }

      if (!isValid) {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid verification code" });
      }

      // Issue full tokens
      const accessToken = fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = crypto.randomBytes(32).toString("hex");
      await storeRefreshToken(refreshToken, user.id);

      reply.setCookie("refreshToken", refreshToken, refreshCookieOptions());

      const response: LoginResponse = {
        accessToken,
        expiresIn: 900,
        user: toUserResponse(user),
      };

      return reply.send(response);
    },
  );

  // DELETE /auth/totp — disable 2FA (authenticated)
  fastify.delete<{ Body: { code: string } }>(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object" as const,
          required: ["code"],
          additionalProperties: false,
          properties: { code: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { code: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { code } = request.body;

      const user = await getUserById(userId);
      if (!user || !user.totpEnabled || !user.totpSecret) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "2FA is not enabled" });
      }

      const isValid = verifyTotpCode(user.totpSecret, code, user.email);
      if (!isValid) {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid verification code" });
      }

      await updateUser(userId, {
        totpEnabled: false,
        totpSecret: null,
        backupCodes: [],
      });

      return reply.send({ message: "Two-factor authentication disabled" });
    },
  );
}
