import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { adminGuard } from "../middleware/adminGuard.js";
import { listUsers, getUserById, updateUser, deleteUser } from "../store/userStore.js";
import { revokeAllRefreshTokens } from "../store/refreshTokenStore.js";
import { getSetting, setSetting } from "../store/settingStore.js";
import { cleanupStaleCursors, sweepTombstones } from "../store/syncStore.js";
import { toUserResponse } from "../lib/mappers.js";

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);
  fastify.addHook("onRequest", adminGuard);

  // GET /admin/users — list all users
  fastify.get(
    "/users",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const users = await listUsers();
      return reply.send({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName ?? null,
          role: u.role,
          totpEnabled: u.totpEnabled,
          createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
        })),
      });
    },
  );

  // POST /admin/users/:id/reset-password — reset a user's password
  fastify.post<{ Params: { id: string }; Body: { newPassword: string } }>(
    "/users/:id/reset-password",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["newPassword"],
          additionalProperties: false,
          properties: {
            newPassword: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { newPassword: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { newPassword } = request.body;

      const user = await getUserById(id);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await updateUser(id, { passwordHash, mustChangePassword: true });
      await revokeAllRefreshTokens(id);

      return reply.send({ message: "Password reset successfully" });
    },
  );

  // DELETE /admin/users/:id — delete a user and all their data
  fastify.delete<{ Params: { id: string } }>(
    "/users/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      // Prevent self-deletion
      if (id === request.user.sub) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Cannot delete your own account",
        });
      }

      const deleted = await deleteUser(id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      return reply.send({ message: "User deleted successfully" });
    },
  );

  // GET /admin/approved-emails
  fastify.get(
    "/approved-emails",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const raw = await getSetting("approvedEmails");
      const emails = raw
        ? raw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];
      return reply.send({ emails });
    },
  );

  // PUT /admin/approved-emails
  fastify.put<{ Body: { emails: string[] } }>(
    "/approved-emails",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["emails"],
          additionalProperties: false,
          properties: {
            emails: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { emails: string[] } }>,
      reply: FastifyReply,
    ) => {
      const { emails } = request.body;
      const value = emails.map((e) => e.trim().toLowerCase()).filter(Boolean).join(",");
      await setSetting("approvedEmails", value);
      return reply.send({ emails: value.split(",").filter(Boolean) });
    },
  );

  // GET /admin/ai-settings
  fastify.get(
    "/ai-settings",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const value = await getSetting("aiEnabled");
      // Default to enabled if not set
      const aiEnabled = value !== "false";
      return reply.send({ aiEnabled });
    },
  );

  // PUT /admin/ai-settings
  fastify.put<{ Body: { aiEnabled: boolean } }>(
    "/ai-settings",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["aiEnabled"],
          additionalProperties: false,
          properties: {
            aiEnabled: { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { aiEnabled: boolean } }>,
      reply: FastifyReply,
    ) => {
      const { aiEnabled } = request.body;
      await setSetting("aiEnabled", String(aiEnabled));
      return reply.send({ aiEnabled });
    },
  );

  // POST /admin/maintenance/sweep-tombstones — Phase 4.5
  //
  // Runs cleanupStaleCursors first (so abandoned cursors don't pin
  // tombstones indefinitely), then sweeps tombstones that every
  // remaining active cursor has advanced past.
  fastify.post(
    "/maintenance/sweep-tombstones",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const cursorsRemoved = await cleanupStaleCursors(90);
      const tombstonesRemoved = await sweepTombstones({
        logger: request.log,
      });
      return reply.send({ cursorsRemoved, tombstonesRemoved });
    },
  );
}
