import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  computeNetIncomeProjection,
  computeAccountProjections,
  computeSavingsProjection,
  listSavingsAccounts,
} from "../store/projectionsStore.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

const VALID_NET_INCOME_MONTHS = [6, 12, 24];
const VALID_ACCOUNT_BALANCE_MONTHS = [6, 12, 24];
const VALID_SAVINGS_MONTHS = [12, 24, 60, 120];

export default async function projectionRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /net-income — net income projection
  fastify.get<{
    Querystring: { months?: string; incomeAdj?: string; expenseAdj?: string };
  }>(
    "/net-income",
    async (
      request: FastifyRequest<{
        Querystring: {
          months?: string;
          incomeAdj?: string;
          expenseAdj?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const monthsRaw = parseInt(request.query.months || "12", 10);
        const months = VALID_NET_INCOME_MONTHS.includes(monthsRaw)
          ? monthsRaw
          : 12;

        const incomeAdjRaw = parseFloat(request.query.incomeAdj || "0") || 0;
        const incomeAdjustmentPct = Math.max(-50, Math.min(50, incomeAdjRaw));

        const expenseAdjRaw =
          parseFloat(request.query.expenseAdj || "0") || 0;
        const expenseAdjustmentPct = Math.max(
          -50,
          Math.min(50, expenseAdjRaw),
        );

        const result = await computeNetIncomeProjection({
          months,
          incomeAdjustmentPct,
          expenseAdjustmentPct,
        });

        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute net income projection");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute net income projection",
        });
      }
    },
  );

  // GET /account-balances — per-account balance projections
  fastify.get<{
    Querystring: { months?: string; incomeAdj?: string; expenseAdj?: string };
  }>(
    "/account-balances",
    async (
      request: FastifyRequest<{
        Querystring: {
          months?: string;
          incomeAdj?: string;
          expenseAdj?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const monthsRaw = parseInt(request.query.months || "12", 10);
        const months = VALID_ACCOUNT_BALANCE_MONTHS.includes(monthsRaw)
          ? monthsRaw
          : 12;

        const incomeAdjRaw = parseFloat(request.query.incomeAdj || "0") || 0;
        const incomeAdjustmentPct = Math.max(-50, Math.min(50, incomeAdjRaw));

        const expenseAdjRaw =
          parseFloat(request.query.expenseAdj || "0") || 0;
        const expenseAdjustmentPct = Math.max(
          -50,
          Math.min(50, expenseAdjRaw),
        );

        const result = await computeAccountProjections({
          months,
          incomeAdjustmentPct,
          expenseAdjustmentPct,
        });

        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute account balance projections");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute account balance projections",
        });
      }
    },
  );

  // GET /savings/accounts — list savings accounts
  fastify.get(
    "/savings/accounts",
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        const accounts = await listSavingsAccounts();
        return reply.send({ accounts });
      } catch (e) {
        request.log.error(e, "Failed to list savings accounts");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to list savings accounts",
        });
      }
    },
  );

  // GET /savings/:accountId — savings projection for a specific account
  fastify.get<{
    Params: { accountId: string };
    Querystring: {
      months?: string;
      contribution?: string;
      apy?: string;
    };
  }>(
    "/savings/:accountId",
    async (
      request: FastifyRequest<{
        Params: { accountId: string };
        Querystring: {
          months?: string;
          contribution?: string;
          apy?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!CUID_PATTERN.test(request.params.accountId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid account ID format",
        });
      }

      try {
        const monthsRaw = parseInt(request.query.months || "12", 10);
        const months = VALID_SAVINGS_MONTHS.includes(monthsRaw)
          ? monthsRaw
          : 12;

        let contributionOverride: number | undefined;
        if (request.query.contribution !== undefined) {
          const val = parseFloat(request.query.contribution);
          if (Number.isFinite(val) && val >= 0) {
            contributionOverride = val;
          }
        }

        let apyOverride: number | undefined;
        if (request.query.apy !== undefined) {
          const val = parseFloat(request.query.apy);
          if (Number.isFinite(val) && val >= 0 && val <= 100) {
            apyOverride = val;
          }
        }

        const result = await computeSavingsProjection({
          accountId: request.params.accountId,
          months,
          contributionOverride,
          apyOverride,
        });

        if (!result) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Savings account not found",
          });
        }

        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute savings projection");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute savings projection",
        });
      }
    },
  );
}
