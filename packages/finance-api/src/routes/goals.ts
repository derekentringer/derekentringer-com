import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { CreateGoalRequest, UpdateGoalRequest, ReorderGoalsRequest } from "@derekentringer/shared";
import { requirePin } from "@derekentringer/shared/auth/pinVerify";
import { loadConfig } from "../config.js";
import {
  createGoal,
  getGoal,
  listGoals,
  updateGoal,
  deleteGoal,
  reorderGoals,
} from "../store/goalStore.js";
import { computeGoalProgress } from "../store/goalProgressStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

const VALID_GOAL_TYPES = ["savings", "debt_payoff", "net_worth", "custom"];
const VALID_MONTHS = [12, 24, 36, 60, 120];

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const createGoalSchema = {
  body: {
    type: "object" as const,
    required: ["name", "type", "targetAmount"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      type: { type: "string" },
      targetAmount: { type: "number" },
      currentAmount: { type: "number" },
      targetDate: { type: ["string", "null"] },
      priority: { type: "integer" },
      accountIds: { type: "array", items: { type: "string" } },
      extraPayment: { type: "number" },
      monthlyContribution: { type: "number" },
      startDate: { type: ["string", "null"] },
      startAmount: { type: "number" },
      notes: { type: ["string", "null"] },
    },
  },
};

const updateGoalSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      type: { type: "string" },
      targetAmount: { type: "number" },
      currentAmount: { type: ["number", "null"] },
      targetDate: { type: ["string", "null"] },
      startDate: { type: ["string", "null"] },
      startAmount: { type: ["number", "null"] },
      priority: { type: "integer" },
      accountIds: { type: ["array", "null"], items: { type: "string" } },
      extraPayment: { type: ["number", "null"] },
      monthlyContribution: { type: ["number", "null"] },
      notes: { type: ["string", "null"] },
      isActive: { type: "boolean" },
      isCompleted: { type: "boolean" },
    },
  },
};

const reorderSchema = {
  body: {
    type: "object" as const,
    required: ["order"],
    additionalProperties: false,
    properties: {
      order: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "sortOrder"],
          properties: {
            id: { type: "string" },
            sortOrder: { type: "integer" },
          },
        },
      },
    },
  },
};

export default async function goalRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  const config = loadConfig();
  const pinGuard = requirePin(config.pinTokenSecret);

  // GET / — list goals
  fastify.get<{ Querystring: { active?: string; type?: string } }>(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { active?: string; type?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { active, type } = request.query;
        const filter: { isActive?: boolean; type?: string } = {};
        if (active === "true") filter.isActive = true;
        if (active === "false") filter.isActive = false;
        if (type && VALID_GOAL_TYPES.includes(type)) filter.type = type;

        const goals = await listGoals(filter);
        return reply.send({ goals });
      } catch (e) {
        request.log.error(e, "Failed to list goals");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list goals",
        });
      }
    },
  );

  // GET /progress — computed progress for all active goals
  fastify.get<{ Querystring: { months?: string } }>(
    "/progress",
    async (
      request: FastifyRequest<{ Querystring: { months?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const rawMonths = parseInt(request.query.months || "60", 10) || 60;
        const months = VALID_MONTHS.includes(rawMonths) ? rawMonths : 60;

        const progress = await computeGoalProgress({ months });
        return reply.send(progress);
      } catch (e) {
        request.log.error(e, "Failed to compute goal progress");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute goal progress",
        });
      }
    },
  );

  // GET /:id — single goal
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
          message: "Invalid goal ID format",
        });
      }

      try {
        const goal = await getGoal(request.params.id);
        if (!goal) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Goal not found",
          });
        }
        return reply.send({ goal });
      } catch (e) {
        request.log.error(e, "Failed to get goal");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get goal",
        });
      }
    },
  );

  // POST / — create goal
  fastify.post<{ Body: CreateGoalRequest }>(
    "/",
    { schema: createGoalSchema },
    async (
      request: FastifyRequest<{ Body: CreateGoalRequest }>,
      reply: FastifyReply,
    ) => {
      const { targetAmount, type } = request.body;

      if (!VALID_GOAL_TYPES.includes(type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `type must be one of: ${VALID_GOAL_TYPES.join(", ")}`,
        });
      }

      const minTarget = type === "debt_payoff" ? 0 : 1;
      if (!isValidNumber(targetAmount) || targetAmount < minTarget) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `targetAmount must be at least ${minTarget}`,
        });
      }

      try {
        const goal = await createGoal(request.body);
        return reply.status(201).send({ goal });
      } catch (e) {
        request.log.error(e, "Failed to create goal");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create goal",
        });
      }
    },
  );

  // PATCH /:id — update goal
  fastify.patch<{ Params: { id: string }; Body: UpdateGoalRequest }>(
    "/:id",
    { schema: updateGoalSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateGoalRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid goal ID format",
        });
      }

      const { targetAmount, type } = request.body;

      if (type !== undefined && !VALID_GOAL_TYPES.includes(type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `type must be one of: ${VALID_GOAL_TYPES.join(", ")}`,
        });
      }

      if (targetAmount !== undefined && (!isValidNumber(targetAmount) || targetAmount < 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "targetAmount must be at least 0",
        });
      }

      try {
        const goal = await updateGoal(request.params.id, request.body);
        if (!goal) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Goal not found",
          });
        }
        return reply.send({ goal });
      } catch (e) {
        request.log.error(e, "Failed to update goal");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update goal",
        });
      }
    },
  );

  // DELETE /:id — delete goal (PIN-protected)
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
          message: "Invalid goal ID format",
        });
      }

      try {
        const deleted = await deleteGoal(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Goal not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete goal");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete goal",
        });
      }
    },
  );

  // PUT /reorder — reorder goals
  fastify.put<{ Body: ReorderGoalsRequest }>(
    "/reorder",
    { schema: reorderSchema },
    async (
      request: FastifyRequest<{ Body: ReorderGoalsRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        await reorderGoals(request.body.order);
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to reorder goals");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to reorder goals",
        });
      }
    },
  );
}
