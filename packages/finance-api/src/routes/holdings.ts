import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { CreateHoldingRequest, UpdateHoldingRequest, ReorderHoldingsRequest } from "@derekentringer/shared";
import { ASSET_CLASSES } from "@derekentringer/shared";
import { requirePin } from "@derekentringer/shared/auth/pinVerify";
import { loadConfig } from "../config.js";
import {
  createHolding,
  getHolding,
  listHoldings,
  updateHolding,
  deleteHolding,
  reorderHoldings,
} from "../store/holdingStore.js";
import { getPrisma } from "../lib/prisma.js";
import { decryptAccount } from "../lib/mappers.js";
import { fetchQuote as fetchFinnhubQuote } from "../lib/finnhub.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const createHoldingSchema = {
  body: {
    type: "object" as const,
    required: ["accountId", "name", "assetClass"],
    additionalProperties: false,
    properties: {
      accountId: { type: "string" },
      name: { type: "string", minLength: 1 },
      ticker: { type: "string" },
      shares: { type: "number" },
      costBasis: { type: "number" },
      currentPrice: { type: "number" },
      assetClass: { type: "string" },
      notes: { type: ["string", "null"] },
    },
  },
};

const updateHoldingSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      ticker: { type: ["string", "null"] },
      shares: { type: ["number", "null"] },
      costBasis: { type: ["number", "null"] },
      currentPrice: { type: ["number", "null"] },
      assetClass: { type: "string" },
      notes: { type: ["string", "null"] },
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

async function validateInvestmentAccount(accountId: string): Promise<{ valid: boolean; error?: string }> {
  const prisma = getPrisma();
  const row = await prisma.account.findUnique({ where: { id: accountId } });
  if (!row) return { valid: false, error: "Account not found" };
  const account = decryptAccount(row);
  if (account.type !== "investment") {
    return { valid: false, error: "Account is not an investment account" };
  }
  return { valid: true };
}

export default async function holdingRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  const config = loadConfig();
  const pinGuard = requirePin(config.pinTokenSecret);

  // GET / — list holdings for an account
  fastify.get<{ Querystring: { accountId?: string } }>(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountId } = request.query;
      if (!accountId || !CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "accountId query parameter is required and must be a valid ID",
        });
      }

      try {
        const holdings = await listHoldings(accountId);
        return reply.send({ holdings });
      } catch (e) {
        request.log.error(e, "Failed to list holdings");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list holdings",
        });
      }
    },
  );

  // GET /:id — single holding
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
          message: "Invalid holding ID format",
        });
      }

      try {
        const holding = await getHolding(request.params.id);
        if (!holding) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Holding not found",
          });
        }
        return reply.send({ holding });
      } catch (e) {
        request.log.error(e, "Failed to get holding");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to get holding",
        });
      }
    },
  );

  // POST / — create holding
  fastify.post<{ Body: CreateHoldingRequest }>(
    "/",
    { schema: createHoldingSchema },
    async (
      request: FastifyRequest<{ Body: CreateHoldingRequest }>,
      reply: FastifyReply,
    ) => {
      const { accountId, assetClass, shares, costBasis, currentPrice } = request.body;

      if (!CUID_PATTERN.test(accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid accountId format",
        });
      }

      if (!ASSET_CLASSES.includes(assetClass)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `assetClass must be one of: ${ASSET_CLASSES.join(", ")}`,
        });
      }

      if (shares !== undefined && (!isValidNumber(shares) || shares < 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "shares must be a non-negative number",
        });
      }

      if (costBasis !== undefined && !isValidNumber(costBasis)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "costBasis must be a valid number",
        });
      }

      if (currentPrice !== undefined && !isValidNumber(currentPrice)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "currentPrice must be a valid number",
        });
      }

      try {
        const validation = await validateInvestmentAccount(accountId);
        if (!validation.valid) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: validation.error,
          });
        }

        const holding = await createHolding(request.body);
        return reply.status(201).send({ holding });
      } catch (e) {
        request.log.error(e, "Failed to create holding");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create holding",
        });
      }
    },
  );

  // PATCH /:id — update holding
  fastify.patch<{ Params: { id: string }; Body: UpdateHoldingRequest }>(
    "/:id",
    { schema: updateHoldingSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateHoldingRequest;
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid holding ID format",
        });
      }

      const { assetClass, shares, costBasis, currentPrice } = request.body;

      if (assetClass !== undefined && !ASSET_CLASSES.includes(assetClass)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `assetClass must be one of: ${ASSET_CLASSES.join(", ")}`,
        });
      }

      if (shares !== undefined && shares !== null && (!isValidNumber(shares) || shares < 0)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "shares must be a non-negative number",
        });
      }

      if (costBasis !== undefined && costBasis !== null && !isValidNumber(costBasis)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "costBasis must be a valid number",
        });
      }

      if (currentPrice !== undefined && currentPrice !== null && !isValidNumber(currentPrice)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "currentPrice must be a valid number",
        });
      }

      try {
        const holding = await updateHolding(request.params.id, request.body);
        if (!holding) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Holding not found",
          });
        }
        return reply.send({ holding });
      } catch (e) {
        request.log.error(e, "Failed to update holding");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update holding",
        });
      }
    },
  );

  // DELETE /:id — delete holding (PIN-protected)
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
          message: "Invalid holding ID format",
        });
      }

      try {
        const deleted = await deleteHolding(request.params.id);
        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Holding not found",
          });
        }
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to delete holding");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete holding",
        });
      }
    },
  );

  // PUT /reorder — reorder holdings
  fastify.put<{ Body: ReorderHoldingsRequest }>(
    "/reorder",
    { schema: reorderSchema },
    async (
      request: FastifyRequest<{ Body: ReorderHoldingsRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        await reorderHoldings(request.body.order);
        return reply.status(204).send();
      } catch (e) {
        request.log.error(e, "Failed to reorder holdings");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to reorder holdings",
        });
      }
    },
  );

  // GET /quote/:ticker — fetch price from Finnhub
  const TICKER_PATTERN = /^[A-Z0-9.]{1,10}$/i;

  fastify.get<{ Params: { ticker: string } }>(
    "/quote/:ticker",
    async (
      request: FastifyRequest<{ Params: { ticker: string } }>,
      reply: FastifyReply,
    ) => {
      const { ticker } = request.params;

      if (!TICKER_PATTERN.test(ticker)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid ticker format",
        });
      }

      try {
        const quote = await fetchFinnhubQuote(ticker.toUpperCase());
        return reply.send({
          ticker: ticker.toUpperCase(),
          currentPrice: quote.c,
          change: quote.d,
          changePercent: quote.dp,
          high: quote.h,
          low: quote.l,
          open: quote.o,
          previousClose: quote.pc,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to fetch quote";
        if (message.includes("not configured")) {
          return reply.status(503).send({
            statusCode: 503,
            error: "Service Unavailable",
            message: "Price feed not configured",
          });
        }
        request.log.error(e, "Failed to fetch quote");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message,
        });
      }
    },
  );
}
