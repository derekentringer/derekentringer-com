import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateIncomeSourceRequest,
  UpdateIncomeSourceRequest,
} from "@derekentringer/shared";
import { INCOME_SOURCE_FREQUENCIES } from "@derekentringer/shared";
import {
  createIncomeSource,
  getIncomeSource,
  listIncomeSources,
  updateIncomeSource,
  deleteIncomeSource,
} from "../store/incomeSourceStore.js";
import { detectIncomePatterns } from "../store/projectionsStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const createSchema = {
  body: {
    type: "object" as const,
    required: ["name", "amount", "frequency"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      amount: { type: "number" },
      frequency: { type: "string" },
      isActive: { type: "boolean" },
      notes: { type: ["string", "null"] },
    },
  },
};

const updateSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      amount: { type: "number" },
      frequency: { type: "string" },
      isActive: { type: "boolean" },
      notes: { type: ["string", "null"] },
    },
  },
};

export default async function incomeSourceRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET / — list income sources
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

        const incomeSources = await listIncomeSources(filter);
        return reply.send({ incomeSources });
      } catch (e) {
        request.log.error(e, "Failed to list income sources");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list income sources",
        });
      }
    },
  );

  // GET /detected — auto-detected income patterns from transactions
  fastify.get(
    "/detected",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const patterns = await detectIncomePatterns();
        return reply.send({ patterns });
      } catch (e) {
        request.log.error(e, "Failed to detect income patterns");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to detect income patterns",
        });
      }
    },
  );

  // GET /:id — single income source
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
          message: "Invalid income source ID format",
        });
      }

      try {
        const incomeSource = await getIncomeSource(request.params.id);
        if (!incomeSource) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Income source not found",
          });
        }
        return reply.send({ incomeSource });
      } catch (e) {
        request.log.error(e, "Failed to get income source");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get income source",
        });
      }
    },
  );

  // POST / — create income source
  fastify.post<{ Body: CreateIncomeSourceRequest }>(
    "/",
    { schema: createSchema },
    async (
      request: FastifyRequest<{ Body: CreateIncomeSourceRequest }>,
      reply: FastifyReply,
    ) => {
      const { amount, frequency } = request.body;

      if (!isValidNumber(amount) || amount <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a positive finite number",
        });
      }

      if (
        !INCOME_SOURCE_FREQUENCIES.includes(
          frequency as (typeof INCOME_SOURCE_FREQUENCIES)[number],
        )
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `frequency must be one of: ${INCOME_SOURCE_FREQUENCIES.join(", ")}`,
        });
      }

      try {
        const incomeSource = await createIncomeSource(request.body);
        return reply.status(201).send({ incomeSource });
      } catch (e) {
        request.log.error(e, "Failed to create income source");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create income source",
        });
      }
    },
  );

  // PATCH /:id — update income source
  fastify.patch<{ Params: { id: string }; Body: UpdateIncomeSourceRequest }>(
    "/:id",
    { schema: updateSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateIncomeSourceRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid income source ID format",
        });
      }

      const { amount, frequency } = request.body;

      if (amount !== undefined && (!isValidNumber(amount) || amount <= 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "amount must be a positive finite number",
        });
      }

      if (
        frequency !== undefined &&
        !INCOME_SOURCE_FREQUENCIES.includes(
          frequency as (typeof INCOME_SOURCE_FREQUENCIES)[number],
        )
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `frequency must be one of: ${INCOME_SOURCE_FREQUENCIES.join(", ")}`,
        });
      }

      try {
        const incomeSource = await updateIncomeSource(
          request.params.id,
          request.body,
        );
        if (!incomeSource) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Income source not found",
          });
        }
        return reply.send({ incomeSource });
      } catch (e) {
        request.log.error(e, "Failed to update income source");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update income source",
        });
      }
    },
  );

  // DELETE /:id — delete income source
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
          message: "Invalid income source ID format",
        });
      }

      try {
        const deleted = await deleteIncomeSource(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Income source not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete income source");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete income source",
        });
      }
    },
  );
}
