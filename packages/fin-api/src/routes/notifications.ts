import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  RegisterDeviceRequest,
  UpdateNotificationPreferenceRequest,
} from "@derekentringer/shared";
import { NotificationType } from "@derekentringer/shared";
import {
  registerDeviceToken,
  listDeviceTokens,
  deleteDeviceToken,
  listNotificationPreferences,
  updateNotificationPreference,
  listNotificationLogs,
  getUnreadCount,
  markAllNotificationsRead,
  clearNotificationHistory,
  createNotificationLog,
} from "../store/notificationStore.js";
import { sendToAllDevices } from "../lib/fcm.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

const VALID_NOTIFICATION_TYPES = new Set(Object.values(NotificationType));

const registerDeviceSchema = {
  body: {
    type: "object" as const,
    required: ["token", "platform"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1 },
      platform: { type: "string", enum: ["web", "ios", "android"] },
      name: { type: "string" },
    },
  },
};

const updatePreferenceSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      enabled: { type: "boolean" },
      config: {},
    },
  },
};

export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // POST /devices — register FCM device token
  fastify.post<{ Body: RegisterDeviceRequest }>(
    "/devices",
    { schema: registerDeviceSchema },
    async (
      request: FastifyRequest<{ Body: RegisterDeviceRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const device = await registerDeviceToken(request.body);
        return reply.status(201).send({ device });
      } catch (e) {
        request.log.error(e, "Failed to register device token");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to register device token",
        });
      }
    },
  );

  // GET /devices — list registered devices
  fastify.get(
    "/devices",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const devices = await listDeviceTokens();
        return reply.send({ devices });
      } catch (e) {
        request.log.error(e, "Failed to list devices");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list devices",
        });
      }
    },
  );

  // DELETE /devices/:id — remove device
  fastify.delete<{ Params: { id: string } }>(
    "/devices/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid device ID format",
        });
      }

      try {
        const deleted = await deleteDeviceToken(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Device not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete device");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete device",
        });
      }
    },
  );

  // GET /preferences — list all preferences (seeds defaults if empty)
  fastify.get(
    "/preferences",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const preferences = await listNotificationPreferences();
        return reply.send({ preferences });
      } catch (e) {
        request.log.error(e, "Failed to list notification preferences");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list notification preferences",
        });
      }
    },
  );

  // PATCH /preferences/:type — update enabled/config for a type
  fastify.patch<{
    Params: { type: string };
    Body: UpdateNotificationPreferenceRequest;
  }>(
    "/preferences/:type",
    { schema: updatePreferenceSchema },
    async (
      request: FastifyRequest<{
        Params: { type: string };
        Body: UpdateNotificationPreferenceRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const { type } = request.params;
      if (!VALID_NOTIFICATION_TYPES.has(type as NotificationType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid notification type",
        });
      }

      try {
        const preference = await updateNotificationPreference(type, request.body);
        if (!preference) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Notification preference not found",
          });
        }
        return reply.send({ preference });
      } catch (e) {
        request.log.error(e, "Failed to update notification preference");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update notification preference",
        });
      }
    },
  );

  // GET /history?limit=20&offset=0 — paginated notification log
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/history",
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const limit = Math.min(parseInt(request.query.limit || "20", 10) || 20, 100);
        const offset = parseInt(request.query.offset || "0", 10) || 0;
        const result = await listNotificationLogs(limit, offset);
        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to list notification history");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list notification history",
        });
      }
    },
  );

  // GET /unread-count — returns { count: number }
  fastify.get(
    "/unread-count",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await getUnreadCount();
        return reply.send({ count });
      } catch (e) {
        request.log.error(e, "Failed to get unread count");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get unread count",
        });
      }
    },
  );

  // POST /mark-all-read — sets isRead = true on all unread notifications
  fastify.post(
    "/mark-all-read",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await markAllNotificationsRead();
        return reply.send({ updated: count });
      } catch (e) {
        request.log.error(e, "Failed to mark notifications as read");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to mark notifications as read",
        });
      }
    },
  );

  // DELETE /history — clears all notification log entries
  fastify.delete(
    "/history",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await clearNotificationHistory();
        return reply.send({ cleared: count });
      } catch (e) {
        request.log.error(e, "Failed to clear notification history");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to clear notification history",
        });
      }
    },
  );

  // POST /test — send test push to all devices
  fastify.post(
    "/test",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const logEntry = await createNotificationLog({
          type: NotificationType.BillDue,
          title: "Test Notification",
          body: "This is a test notification from your finance app.",
          dedupeKey: `test:${Date.now()}`,
          metadata: { test: true },
        });

        let fcmResult = null;
        if (logEntry) {
          fcmResult = await sendToAllDevices(
            {
              title: "Test Notification",
              body: "This is a test notification from your finance app.",
              data: { route: "/settings", notificationId: logEntry.id },
            },
            logEntry.id,
          );
          if (fcmResult.error) {
            request.log.warn(`FCM send failed: ${fcmResult.error}`);
          }
        }

        return reply.send({
          success: true,
          notification: logEntry,
          fcm: fcmResult,
        });
      } catch (e) {
        request.log.error(e, "Failed to send test notification");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to send test notification",
        });
      }
    },
  );
}
