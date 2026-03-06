import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getUserById, getUserByEmail } from "../store/userStore.js";
import {
  createPasskey,
  getPasskeysByUserId,
  getPasskeyByCredentialId,
  updatePasskeyCounter,
  deletePasskey,
} from "../store/passkeyStore.js";
import { storeRefreshToken } from "../store/refreshTokenStore.js";
import { loadConfig } from "../config.js";
import { toUserResponse } from "../lib/mappers.js";
import type { LoginResponse, PasskeyInfo } from "@derekentringer/shared";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// In-memory challenge stores (5min TTL)
const registrationChallenges = new Map<string, { challenge: string; expiresAt: number }>();
const authenticationChallenges = new Map<string, { challenge: string; userId?: string; expiresAt: number }>();

function cleanupChallenges() {
  const now = Date.now();
  for (const [key, val] of registrationChallenges) {
    if (val.expiresAt < now) registrationChallenges.delete(key);
  }
  for (const [key, val] of authenticationChallenges) {
    if (val.expiresAt < now) authenticationChallenges.delete(key);
  }
}

export default async function passkeyRoutes(fastify: FastifyInstance) {
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

  function getRpOrigin(): string {
    return config.corsOrigin;
  }

  // POST /auth/passkeys/register-options (authenticated)
  fastify.post(
    "/register-options",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      cleanupChallenges();

      const userId = request.user.sub;
      const user = await getUserById(userId);
      if (!user) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "User not found" });
      }

      const existingPasskeys = await getPasskeysByUserId(userId);
      const excludeCredentials = existingPasskeys.map((pk) => ({
        id: pk.credentialId,
        transports: (Array.isArray(pk.transports) ? pk.transports : []) as (
          | "ble"
          | "cable"
          | "hybrid"
          | "internal"
          | "nfc"
          | "smart-card"
          | "usb"
        )[],
      }));

      const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userName: user.email,
        userDisplayName: user.displayName || user.email,
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        attestationType: "none",
      });

      registrationChallenges.set(userId, {
        challenge: options.challenge,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return reply.send(options);
    },
  );

  // POST /auth/passkeys/register-verify (authenticated)
  fastify.post<{ Body: { credential: RegistrationResponseJSON; friendlyName?: string } }>(
    "/register-verify",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object" as const,
          required: ["credential"],
          properties: {
            credential: { type: "object" },
            friendlyName: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { credential: RegistrationResponseJSON; friendlyName?: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { credential, friendlyName } = request.body;

      const storedChallenge = registrationChallenges.get(userId);
      if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
        registrationChallenges.delete(userId);
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "Registration challenge expired" });
      }

      try {
        const verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: getRpOrigin(),
          expectedRPID: config.rpId,
          requireUserVerification: false,
        });

        if (!verification.verified || !verification.registrationInfo) {
          return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "Verification failed" });
        }

        const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        const passkey = await createPasskey(userId, {
          credentialId: cred.id,
          publicKey: new Uint8Array(cred.publicKey),
          counter: cred.counter,
          transports: (cred.transports || []) as string[],
          deviceType: credentialDeviceType || null,
          backedUp: credentialBackedUp,
          friendlyName: friendlyName || null,
        });

        registrationChallenges.delete(userId);

        return reply.status(201).send({
          id: passkey.id,
          friendlyName: passkey.friendlyName,
        });
      } catch (err) {
        request.log.error(err, "Passkey registration verification failed");
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: "Verification failed" });
      }
    },
  );

  // POST /auth/passkeys/login-options (unauthenticated)
  fastify.post<{ Body: { email?: string } }>(
    "/login-options",
    {
      schema: {
        body: {
          type: "object" as const,
          additionalProperties: false,
          properties: {
            email: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { email?: string } }>,
      reply: FastifyReply,
    ) => {
      cleanupChallenges();

      const { email } = request.body;

      let allowCredentials: { id: string; transports?: ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] }[] | undefined;
      let userId: string | undefined;

      if (email) {
        const user = await getUserByEmail(email);
        if (user) {
          userId = user.id;
          const passkeys = await getPasskeysByUserId(user.id);
          allowCredentials = passkeys.map((pk) => ({
            id: pk.credentialId,
            transports: (Array.isArray(pk.transports) ? pk.transports : []) as (
              | "ble"
              | "cable"
              | "hybrid"
              | "internal"
              | "nfc"
              | "smart-card"
              | "usb"
            )[],
          }));
        }
      }

      const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        allowCredentials,
        userVerification: "preferred",
      });

      const challengeId = crypto.randomBytes(16).toString("hex");
      authenticationChallenges.set(challengeId, {
        challenge: options.challenge,
        userId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return reply.send({ ...options, challengeId });
    },
  );

  // POST /auth/passkeys/login-verify (unauthenticated)
  fastify.post<{ Body: { credential: AuthenticationResponseJSON; challengeId: string } }>(
    "/login-verify",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["credential", "challengeId"],
          properties: {
            credential: { type: "object" },
            challengeId: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { credential: AuthenticationResponseJSON; challengeId: string } }>,
      reply: FastifyReply,
    ) => {
      const { credential, challengeId } = request.body;

      const storedChallenge = authenticationChallenges.get(challengeId);
      if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
        authenticationChallenges.delete(challengeId);
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication challenge expired" });
      }

      // Look up passkey by credential ID
      const passkey = await getPasskeyByCredentialId(credential.id);
      if (!passkey) {
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Unknown credential" });
      }

      try {
        const verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: getRpOrigin(),
          expectedRPID: [config.rpId],
          credential: {
            id: passkey.credentialId,
            publicKey: new Uint8Array(passkey.publicKey),
            counter: Number(passkey.counter),
            transports: (Array.isArray(passkey.transports) ? passkey.transports : []) as (
              | "ble"
              | "cable"
              | "hybrid"
              | "internal"
              | "nfc"
              | "smart-card"
              | "usb"
            )[],
          },
          requireUserVerification: false,
        });

        if (!verification.verified) {
          return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Verification failed" });
        }

        // Update counter
        await updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

        authenticationChallenges.delete(challengeId);

        // Get user — passkey login skips TOTP
        const user = await getUserById(passkey.userId);
        if (!user) {
          return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "User not found" });
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
      } catch (err) {
        request.log.error(err, "Passkey authentication verification failed");
        return reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Verification failed" });
      }
    },
  );

  // GET /auth/passkeys (authenticated) — list user's passkeys
  fastify.get(
    "/",
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const passkeys = await getPasskeysByUserId(request.user.sub);

      const response: PasskeyInfo[] = passkeys.map((pk) => ({
        id: pk.id,
        friendlyName: pk.friendlyName,
        deviceType: pk.deviceType,
        createdAt: pk.createdAt.toISOString(),
        lastUsedAt: pk.lastUsedAt ? pk.lastUsedAt.toISOString() : null,
        backedUp: pk.backedUp,
      }));

      return reply.send({ passkeys: response });
    },
  );

  // DELETE /auth/passkeys/:id (authenticated)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const deleted = await deletePasskey(request.params.id, request.user.sub);
      if (!deleted) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Passkey not found" });
      }
      return reply.send({ message: "Passkey deleted" });
    },
  );
}
