import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
} from "@derekentringer/shared";
import {
  listCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "../store/categoryRuleStore.js";
import { applyRuleToTransactions } from "../store/transactionStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const VALID_MATCH_TYPES = ["exact", "contains"];

const createRuleSchema = {
  body: {
    type: "object" as const,
    required: ["pattern", "matchType", "category"],
    additionalProperties: false,
    properties: {
      pattern: { type: "string", minLength: 1, maxLength: 500 },
      matchType: { type: "string" },
      category: { type: "string", minLength: 1, maxLength: 100 },
      priority: { type: "number" },
    },
  },
};

const updateRuleSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      pattern: { type: "string", minLength: 1, maxLength: 500 },
      matchType: { type: "string" },
      category: { type: "string", minLength: 1, maxLength: 100 },
      priority: { type: "number" },
    },
  },
};

export default async function categoryRuleRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.get(
    "/",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const categoryRules = await listCategoryRules();
        return reply.send({ categoryRules });
      } catch (e) {
        _request.log.error(e, "Failed to list category rules");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list category rules",
        });
      }
    },
  );

  fastify.post<{
    Body: CreateCategoryRuleRequest;
    Querystring: { apply?: string };
  }>(
    "/",
    { schema: createRuleSchema },
    async (
      request: FastifyRequest<{
        Body: CreateCategoryRuleRequest;
        Querystring: { apply?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!VALID_MATCH_TYPES.includes(request.body.matchType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `matchType must be one of: ${VALID_MATCH_TYPES.join(", ")}`,
        });
      }

      try {
        const categoryRule = await createCategoryRule(request.body);
        let appliedCount: number | undefined;

        if (request.query.apply === "true") {
          appliedCount = await applyRuleToTransactions(categoryRule);
        }

        return reply.status(201).send({ categoryRule, appliedCount });
      } catch (e) {
        request.log.error(e, "Failed to create category rule");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create category rule",
        });
      }
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: UpdateCategoryRuleRequest;
    Querystring: { apply?: string };
  }>(
    "/:id",
    { schema: updateRuleSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateCategoryRuleRequest;
        Querystring: { apply?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid rule ID format",
        });
      }

      if (
        request.body.matchType &&
        !VALID_MATCH_TYPES.includes(request.body.matchType)
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `matchType must be one of: ${VALID_MATCH_TYPES.join(", ")}`,
        });
      }

      try {
        const categoryRule = await updateCategoryRule(
          request.params.id,
          request.body,
        );
        if (!categoryRule) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Category rule not found",
          });
        }

        let appliedCount: number | undefined;
        if (request.query.apply === "true") {
          appliedCount = await applyRuleToTransactions(categoryRule);
        }

        return reply.send({ categoryRule, appliedCount });
      } catch (e) {
        request.log.error(e, "Failed to update category rule");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update category rule",
        });
      }
    },
  );

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
          message: "Invalid rule ID format",
        });
      }

      try {
        const deleted = await deleteCategoryRule(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Category rule not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete category rule");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete category rule",
        });
      }
    },
  );
}
