import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  computeNetWorthSummary,
  computeNetWorthHistory,
  computeSpendingSummary,
} from "../store/dashboardStore.js";
import { listBills, getPaymentsInRange, computeUpcomingInstances } from "../store/billStore.js";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /net-worth — current summary + 12-month history
  fastify.get(
    "/net-worth",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [summary, history] = await Promise.all([
          computeNetWorthSummary(),
          computeNetWorthHistory(12),
        ]);
        return reply.send({ summary, history });
      } catch (e) {
        request.log.error(e, "Failed to compute net worth");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute net worth",
        });
      }
    },
  );

  // GET /spending?month=YYYY-MM — spending by category
  fastify.get<{ Querystring: { month?: string } }>(
    "/spending",
    async (
      request: FastifyRequest<{ Querystring: { month?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const month = request.query.month || defaultMonth;

        if (!MONTH_PATTERN.test(month)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "month must be in YYYY-MM format",
          });
        }

        const summary = await computeSpendingSummary(month);
        return reply.send(summary);
      } catch (e) {
        request.log.error(e, "Failed to compute spending summary");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute spending summary",
        });
      }
    },
  );

  // GET /upcoming-bills?days=30 — upcoming bills for dashboard widget
  fastify.get<{ Querystring: { days?: string } }>(
    "/upcoming-bills",
    async (
      request: FastifyRequest<{ Querystring: { days?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const days = Math.min(parseInt(request.query.days || "30", 10) || 30, 365);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7); // Include recent overdue
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + days);

        const [bills, payments] = await Promise.all([
          listBills({ isActive: true }),
          getPaymentsInRange(startDate, endDate),
        ]);

        const instances = computeUpcomingInstances(
          bills,
          payments,
          startDate,
          endDate,
          today,
        );

        const totalDue = instances
          .filter((i) => !i.isPaid)
          .reduce((s, i) => s + i.amount, 0);
        const overdueCount = instances.filter((i) => i.isOverdue).length;

        return reply.send({
          bills: instances,
          totalDue: Math.round(totalDue * 100) / 100,
          overdueCount,
        });
      } catch (e) {
        request.log.error(e, "Failed to compute upcoming bills");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute upcoming bills",
        });
      }
    },
  );
}
