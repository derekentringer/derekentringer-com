import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { CreateBillRequest, UpdateBillRequest } from "@derekentringer/shared";
import { BILL_FREQUENCIES } from "@derekentringer/shared";
import {
  createBill,
  getBill,
  listBills,
  updateBill,
  deleteBill,
  markBillPaid,
  unmarkBillPaid,
  getPaymentsInRange,
  computeUpcomingInstances,
} from "../store/billStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const createBillSchema = {
  body: {
    type: "object" as const,
    required: ["name", "amount", "frequency", "dueDay"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      amount: { type: "number" },
      frequency: { type: "string" },
      dueDay: { type: "integer" },
      dueMonth: { type: ["integer", "null"] },
      dueWeekday: { type: ["integer", "null"] },
      category: { type: ["string", "null"] },
      accountId: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      isActive: { type: "boolean" },
    },
  },
};

const updateBillSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      amount: { type: "number" },
      frequency: { type: "string" },
      dueDay: { type: "integer" },
      dueMonth: { type: ["integer", "null"] },
      dueWeekday: { type: ["integer", "null"] },
      category: { type: ["string", "null"] },
      accountId: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      isActive: { type: "boolean" },
    },
  },
};

const markPaidSchema = {
  body: {
    type: "object" as const,
    required: ["dueDate"],
    additionalProperties: false,
    properties: {
      dueDate: { type: "string" },
      amount: { type: "number" },
    },
  },
};

function validateFrequencyFields(
  frequency: string,
  dueDay: number,
  dueMonth?: number | null,
  dueWeekday?: number | null,
): string | null {
  if (!BILL_FREQUENCIES.includes(frequency as (typeof BILL_FREQUENCIES)[number])) {
    return `frequency must be one of: ${BILL_FREQUENCIES.join(", ")}`;
  }

  if (frequency === "weekly" || frequency === "biweekly") {
    if (dueWeekday === undefined || dueWeekday === null) {
      return `${frequency} bills require dueWeekday (0-6)`;
    }
    if (dueWeekday < 0 || dueWeekday > 6) {
      return "dueWeekday must be 0-6 (Sunday-Saturday)";
    }
  } else {
    // monthly, quarterly, yearly
    if (dueDay < 1 || dueDay > 31) {
      return "dueDay must be 1-31";
    }
    if (frequency === "yearly") {
      if (dueMonth === undefined || dueMonth === null) {
        return "yearly bills require dueMonth (1-12)";
      }
      if (dueMonth < 1 || dueMonth > 12) {
        return "dueMonth must be 1-12";
      }
    }
  }

  return null;
}

export default async function billRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET / — list bills
  fastify.get<{ Querystring: { active?: string } }>(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { active?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { active } = request.query;
        const filter: { isActive?: boolean } = {};
        if (active === "true") filter.isActive = true;
        if (active === "false") filter.isActive = false;

        const bills = await listBills(filter);
        return reply.send({ bills });
      } catch (e) {
        request.log.error(e, "Failed to list bills");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list bills",
        });
      }
    },
  );

  // GET /upcoming?days=30 — computed upcoming instances
  fastify.get<{ Querystring: { days?: string } }>(
    "/upcoming",
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

  // GET /:id — single bill
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid bill ID format",
        });
      }

      try {
        const bill = await getBill(request.params.id);
        if (!bill) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Bill not found",
          });
        }
        return reply.send({ bill });
      } catch (e) {
        request.log.error(e, "Failed to get bill");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get bill",
        });
      }
    },
  );

  // POST / — create bill
  fastify.post<{ Body: CreateBillRequest }>(
    "/",
    { schema: createBillSchema },
    async (
      request: FastifyRequest<{ Body: CreateBillRequest }>,
      reply: FastifyReply,
    ) => {
      const { amount, frequency, dueDay, dueMonth, dueWeekday } =
        request.body;

      if (!isValidNumber(amount) || amount <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a positive finite number",
        });
      }

      const validationError = validateFrequencyFields(
        frequency,
        dueDay,
        dueMonth,
        dueWeekday,
      );
      if (validationError) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: validationError,
        });
      }

      try {
        const bill = await createBill(request.body);
        return reply.status(201).send({ bill });
      } catch (e) {
        request.log.error(e, "Failed to create bill");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create bill",
        });
      }
    },
  );

  // PATCH /:id — update bill
  fastify.patch<{ Params: { id: string }; Body: UpdateBillRequest }>(
    "/:id",
    { schema: updateBillSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateBillRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid bill ID format",
        });
      }

      const { amount, frequency, dueDay, dueMonth, dueWeekday } = request.body;

      if (amount !== undefined && (!isValidNumber(amount) || amount <= 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a positive finite number",
        });
      }

      // If frequency is being changed, validate all frequency fields together
      if (frequency !== undefined || dueDay !== undefined) {
        // Need to fetch existing bill for complete validation
        const existing = await getBill(request.params.id);
        if (!existing) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Bill not found",
          });
        }

        const finalFreq = frequency ?? existing.frequency;
        const finalDueDay = dueDay ?? existing.dueDay;
        const finalDueMonth =
          dueMonth !== undefined ? dueMonth : existing.dueMonth;
        const finalDueWeekday =
          dueWeekday !== undefined ? dueWeekday : existing.dueWeekday;

        const validationError = validateFrequencyFields(
          finalFreq,
          finalDueDay,
          finalDueMonth,
          finalDueWeekday,
        );
        if (validationError) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: validationError,
          });
        }
      }

      try {
        const bill = await updateBill(request.params.id, request.body);
        if (!bill) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Bill not found",
          });
        }
        return reply.send({ bill });
      } catch (e) {
        request.log.error(e, "Failed to update bill");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update bill",
        });
      }
    },
  );

  // DELETE /:id — delete bill (cascades payments)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid bill ID format",
        });
      }

      try {
        const deleted = await deleteBill(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Bill not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete bill");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete bill",
        });
      }
    },
  );

  // POST /:id/pay — mark bill instance as paid
  fastify.post<{
    Params: { id: string };
    Body: { dueDate: string; amount?: number };
  }>(
    "/:id/pay",
    { schema: markPaidSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { dueDate: string; amount?: number };
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid bill ID format",
        });
      }

      const dueDate = new Date(request.body.dueDate + "T00:00:00");
      if (isNaN(dueDate.getTime())) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid dueDate",
        });
      }

      // Get the bill to use its amount as default
      const bill = await getBill(request.params.id);
      if (!bill) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Bill not found",
        });
      }

      const amount = request.body.amount ?? bill.amount;

      try {
        const payment = await markBillPaid(request.params.id, dueDate, amount);
        return reply.status(201).send({ payment });
      } catch (e) {
        request.log.error(e, "Failed to mark bill as paid");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to mark bill as paid",
        });
      }
    },
  );

  // DELETE /:id/pay?dueDate=YYYY-MM-DD — unmark paid
  fastify.delete<{
    Params: { id: string };
    Querystring: { dueDate: string };
  }>(
    "/:id/pay",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { dueDate: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid bill ID format",
        });
      }

      const dueDate = new Date(request.query.dueDate + "T00:00:00");
      if (isNaN(dueDate.getTime())) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid dueDate",
        });
      }

      try {
        const deleted = await unmarkBillPaid(request.params.id, dueDate);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Payment not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to unmark bill payment");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to unmark bill payment",
        });
      }
    },
  );
}
