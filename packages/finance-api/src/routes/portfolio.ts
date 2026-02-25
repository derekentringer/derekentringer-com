import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { SetTargetAllocationsRequest, PerformancePeriod } from "@derekentringer/shared";
import { ASSET_CLASSES } from "@derekentringer/shared";
import { loadConfig } from "../config.js";
import {
  computeAssetAllocation,
  computePerformance,
  computeRebalanceSuggestions,
} from "../store/portfolioStore.js";
import {
  listTargetAllocations,
  setTargetAllocations,
} from "../store/targetAllocationStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const VALID_PERIODS: PerformancePeriod[] = ["1m", "3m", "6m", "12m", "all"];

const setTargetAllocationsSchema = {
  body: {
    type: "object" as const,
    required: ["allocations"],
    additionalProperties: false,
    properties: {
      accountId: { type: ["string", "null"] },
      allocations: {
        type: "array",
        items: {
          type: "object",
          required: ["assetClass", "targetPct"],
          properties: {
            assetClass: { type: "string" },
            targetPct: { type: "number" },
          },
        },
      },
    },
  },
};

export default async function portfolioRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  loadConfig();

  // GET /allocation — asset allocation breakdown
  fastify.get<{ Querystring: { accountId?: string } }>(
    "/allocation",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;
      if (accountId && !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      try {
        const result = await computeAssetAllocation(accountId || null);
        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute asset allocation");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute asset allocation",
        });
      }
    },
  );

  // GET /target-allocations — get target allocations
  fastify.get<{ Querystring: { accountId?: string } }>(
    "/target-allocations",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;
      if (accountId && !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      try {
        const allocations = await listTargetAllocations(accountId ?? null);
        return reply.send({ allocations });
      } catch (e) {
        request.log.error(e, "Failed to list target allocations");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list target allocations",
        });
      }
    },
  );

  // PUT /target-allocations — set target allocations
  fastify.put<{ Body: SetTargetAllocationsRequest }>(
    "/target-allocations",
    { schema: setTargetAllocationsSchema },
    async (
      request: FastifyRequest<{ Body: SetTargetAllocationsRequest }>,
      reply: FastifyReply,
    ) => {
      const { accountId, allocations } = request.body;

      if (accountId && !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      // Validate asset classes
      for (const alloc of allocations) {
        if (!ASSET_CLASSES.includes(alloc.assetClass)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: `Invalid assetClass: ${alloc.assetClass}`,
          });
        }
        if (alloc.targetPct < 0 || alloc.targetPct > 100) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "targetPct must be between 0 and 100",
          });
        }
      }

      // Validate sum = 100
      const sum = allocations.reduce((s, a) => s + a.targetPct, 0);
      if (Math.abs(sum - 100) > 0.01) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Target allocations must sum to 100% (got ${sum.toFixed(2)}%)`,
        });
      }

      try {
        const result = await setTargetAllocations(accountId ?? null, allocations);
        return reply.send({ allocations: result });
      } catch (e) {
        request.log.error(e, "Failed to set target allocations");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to set target allocations",
        });
      }
    },
  );

  // GET /performance — performance data
  fastify.get<{ Querystring: { period?: string; accountId?: string } }>(
    "/performance",
    async (
      request: FastifyRequest<{ Querystring: { period?: string; accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { period, accountId } = request.query;

      if (accountId && !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      const validPeriod: PerformancePeriod =
        period && VALID_PERIODS.includes(period as PerformancePeriod)
          ? (period as PerformancePeriod)
          : "12m";

      try {
        const result = await computePerformance(validPeriod, accountId || null);
        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute performance");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute performance",
        });
      }
    },
  );

  // GET /rebalance — rebalancing suggestions
  fastify.get<{ Querystring: { accountId?: string } }>(
    "/rebalance",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;

      if (accountId && !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      try {
        const result = await computeRebalanceSuggestions(accountId || null);
        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute rebalance suggestions");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute rebalance suggestions",
        });
      }
    },
  );
}
