import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { CreateBudgetRequest, UpdateBudgetRequest } from "@derekentringer/shared";
import { requirePin } from "@derekentringer/shared/auth/pinVerify";
import { loadConfig } from "../config.js";
import {
  createBudget,
  listBudgets,
  updateBudget,
  deleteBudget,
  getActiveBudgetsForMonth,
} from "../store/budgetStore.js";
import { computeSpendingSummary } from "../store/dashboardStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const createBudgetSchema = {
  body: {
    type: "object" as const,
    required: ["category", "amount", "effectiveFrom"],
    additionalProperties: false,
    properties: {
      category: { type: "string", minLength: 1 },
      amount: { type: "number" },
      effectiveFrom: { type: "string" },
      notes: { type: ["string", "null"] },
    },
  },
};

const updateBudgetSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      amount: { type: "number" },
      notes: { type: ["string", "null"] },
    },
  },
};

export default async function budgetRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  const config = loadConfig();
  const pinGuard = requirePin(config.pinTokenSecret);

  // GET / — list all budget records
  fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const budgets = await listBudgets();
      return reply.send({ budgets });
    } catch (e) {
      _request.log.error(e, "Failed to list budgets");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to list budgets",
      });
    }
  });

  // GET /summary?month=YYYY-MM — budget vs actual per category
  fastify.get<{ Querystring: { month?: string } }>(
    "/summary",
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

        const [activeBudgets, spending] = await Promise.all([
          getActiveBudgetsForMonth(month),
          computeSpendingSummary(month),
        ]);

        // Build a map of actual spending by category
        const actualByCategory = new Map<string, number>();
        for (const cat of spending.categories) {
          actualByCategory.set(cat.category, cat.amount);
        }

        // Merge budgets with actuals
        const categories = activeBudgets.map((b) => {
          const actual = actualByCategory.get(b.category) ?? 0;
          return {
            category: b.category,
            budgeted: b.amount,
            actual,
            remaining: Math.round((b.amount - actual) * 100) / 100,
            effectiveFrom: b.effectiveFrom,
          };
        });

        const totalBudgeted = categories.reduce((s, c) => s + c.budgeted, 0);
        const totalActual = categories.reduce((s, c) => s + c.actual, 0);

        return reply.send({
          month,
          categories,
          totalBudgeted: Math.round(totalBudgeted * 100) / 100,
          totalActual: Math.round(totalActual * 100) / 100,
          totalRemaining: Math.round((totalBudgeted - totalActual) * 100) / 100,
        });
      } catch (e) {
        request.log.error(e, "Failed to compute budget summary");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute budget summary",
        });
      }
    },
  );

  // POST / — create budget
  fastify.post<{ Body: CreateBudgetRequest }>(
    "/",
    { schema: createBudgetSchema },
    async (
      request: FastifyRequest<{ Body: CreateBudgetRequest }>,
      reply: FastifyReply,
    ) => {
      const { category, amount, effectiveFrom, notes } = request.body;

      if (!isValidNumber(amount) || amount < 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a non-negative finite number",
        });
      }

      if (!MONTH_PATTERN.test(effectiveFrom)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "effectiveFrom must be in YYYY-MM format",
        });
      }

      try {
        const budget = await createBudget({ category, amount, effectiveFrom, notes });
        return reply.status(201).send({ budget });
      } catch (e: unknown) {
        // Handle unique constraint violation (duplicate category+effectiveFrom)
        if (
          e !== null &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: string }).code === "P2002"
        ) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: `Budget for "${category}" starting ${effectiveFrom} already exists`,
          });
        }
        request.log.error(e, "Failed to create budget");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create budget",
        });
      }
    },
  );

  // PATCH /:id — update budget
  fastify.patch<{ Params: { id: string }; Body: UpdateBudgetRequest }>(
    "/:id",
    { schema: updateBudgetSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateBudgetRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid budget ID format",
        });
      }

      const { amount, notes } = request.body;

      if (amount !== undefined && (!isValidNumber(amount) || amount < 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a non-negative finite number",
        });
      }

      try {
        const budget = await updateBudget(request.params.id, { amount, notes });
        if (!budget) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Budget not found",
          });
        }
        return reply.send({ budget });
      } catch (e) {
        request.log.error(e, "Failed to update budget");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update budget",
        });
      }
    },
  );

  // DELETE /:id — delete budget (PIN required)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: pinGuard },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid budget ID format",
        });
      }

      try {
        const deleted = await deleteBudget(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Budget not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete budget");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete budget",
        });
      }
    },
  );
}
