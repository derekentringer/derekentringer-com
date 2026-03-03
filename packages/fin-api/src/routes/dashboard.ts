import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MortgageRatesResponse } from "@derekentringer/shared/finance";
import {
  computeNetWorthSummary,
  computeNetWorthHistory,
  computeSpendingSummary,
  computeAccountBalanceHistory,
  computeDailySpending,
  computeIncomeSpending,
  computeDTI,
} from "../store/dashboardStore.js";
import { listBills, getPaymentsInRange, computeUpcomingInstances } from "../store/billStore.js";
import { listExcludedAccountIds } from "../store/accountStore.js";
import { loadConfig } from "../config.js";

// In-memory cache for mortgage rates
let mortgageRateCache: { data: MortgageRatesResponse; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function fetchFredRate(seriesId: string, apiKey: string): Promise<{ value: number | null; date: string | null }> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return { value: null, date: null };
  const json = await res.json();
  const obs = json.observations?.[0];
  const val = obs?.value;
  return {
    value: val && val !== "." ? parseFloat(val) : null,
    date: obs?.date ?? null,
  };
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const VALID_RANGES = ["1m", "3m", "6m", "12m", "ytd", "all"];
const VALID_GRANULARITIES = ["daily", "weekly", "monthly"];

function computeStartDate(range: string): Date | undefined {
  const now = new Date();
  switch (range) {
    case "1m":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "3m":
      return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case "6m":
      return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    case "12m":
      return new Date(now.getFullYear(), now.getMonth() - 12, 1);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return new Date(now.getFullYear() - 5, now.getMonth(), 1);
    default:
      return undefined;
  }
}

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /net-worth?range=all&granularity=monthly — current summary + history
  fastify.get<{ Querystring: { range?: string; granularity?: string } }>(
    "/net-worth",
    async (
      request: FastifyRequest<{ Querystring: { range?: string; granularity?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const range = VALID_RANGES.includes(request.query.range || "") ? request.query.range! : "all";
        const granularity = VALID_GRANULARITIES.includes(request.query.granularity || "")
          ? (request.query.granularity as "daily" | "weekly" | "monthly")
          : "monthly";
        const startDate = computeStartDate(range);

        const [summary, { history, accountHistory }] = await Promise.all([
          computeNetWorthSummary(),
          computeNetWorthHistory(granularity, startDate),
        ]);
        return reply.send({ summary, history, accountHistory });
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

  // GET /account-history?accountId=xxx&range=all&granularity=weekly
  fastify.get<{ Querystring: { accountId?: string; range?: string; granularity?: string } }>(
    "/account-history",
    async (
      request: FastifyRequest<{ Querystring: { accountId?: string; range?: string; granularity?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { accountId } = request.query;

        if (!accountId || !CUID_PATTERN.test(accountId)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "accountId is required and must be a valid CUID",
          });
        }

        const range = VALID_RANGES.includes(request.query.range || "") ? request.query.range! : "all";
        const granularity = VALID_GRANULARITIES.includes(request.query.granularity || "")
          ? (request.query.granularity as "daily" | "weekly" | "monthly")
          : "weekly";
        const startDate = computeStartDate(range);

        const result = await computeAccountBalanceHistory(accountId, granularity, startDate);
        if (!result) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Account not found",
          });
        }

        return reply.send(result);
      } catch (e) {
        request.log.error(e, "Failed to compute account balance history");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute account balance history",
        });
      }
    },
  );

  // GET /spending-daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — daily spending totals
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>(
    "/spending-daily",
    async (
      request: FastifyRequest<{ Querystring: { startDate?: string; endDate?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { startDate: startStr, endDate: endStr } = request.query;

        if (!startStr || !endStr || !DATE_PATTERN.test(startStr) || !DATE_PATTERN.test(endStr)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "startDate and endDate are required in YYYY-MM-DD format",
          });
        }

        const startDate = new Date(startStr + "T00:00:00");
        const endDate = new Date(endStr + "T23:59:59.999");

        if (endDate.getTime() - startDate.getTime() > 366 * 24 * 60 * 60 * 1000) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Date range must not exceed 366 days",
          });
        }

        const points = await computeDailySpending(startDate, endDate);
        return reply.send({ points });
      } catch (e) {
        request.log.error(e, "Failed to compute daily spending");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute daily spending",
        });
      }
    },
  );

  // GET /income-spending?range=12m&granularity=monthly&incomeFilter=all|sources
  fastify.get<{ Querystring: { range?: string; granularity?: string; incomeFilter?: string } }>(
    "/income-spending",
    async (
      request: FastifyRequest<{ Querystring: { range?: string; granularity?: string; incomeFilter?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const range = VALID_RANGES.includes(request.query.range || "") ? request.query.range! : "12m";
        const rawGran = request.query.granularity;
        const granularity = rawGran === "weekly" || rawGran === "monthly" ? rawGran : "monthly";
        const startDate = computeStartDate(range);

        let excludedAccountIds: Set<string> | undefined;
        if (request.query.incomeFilter === "sources") {
          const excluded = await listExcludedAccountIds();
          if (excluded.length > 0) excludedAccountIds = new Set(excluded);
        }

        const points = await computeIncomeSpending(granularity, startDate, excludedAccountIds);
        return reply.send({ points });
      } catch (e) {
        request.log.error(e, "Failed to compute income vs spending");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to compute income vs spending",
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
        const days = Math.max(1, Math.min(parseInt(request.query.days || "30", 10) || 30, 365));
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

  // GET /dti — debt-to-income ratio
  fastify.get("/dti", async (request, reply) => {
    try {
      const result = await computeDTI();
      return reply.send(result);
    } catch (e) {
      request.log.error(e, "Failed to compute DTI");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to compute DTI ratio",
      });
    }
  });

  // GET /mortgage-rates — current market mortgage rates from FRED
  fastify.get("/mortgage-rates", async (request, reply) => {
    try {
      const config = loadConfig();
      if (!config.fredApiKey) {
        return reply.send({ rate30yr: null, rate15yr: null, asOf: null });
      }

      if (mortgageRateCache && Date.now() - mortgageRateCache.fetchedAt < CACHE_TTL_MS) {
        return reply.send(mortgageRateCache.data);
      }

      const [r30, r15] = await Promise.all([
        fetchFredRate("MORTGAGE30US", config.fredApiKey),
        fetchFredRate("MORTGAGE15US", config.fredApiKey),
      ]);

      const data: MortgageRatesResponse = {
        rate30yr: r30.value,
        rate15yr: r15.value,
        asOf: r30.date ?? r15.date,
      };

      mortgageRateCache = { data, fetchedAt: Date.now() };
      return reply.send(data);
    } catch (e) {
      request.log.error(e, "Failed to fetch mortgage rates");
      return reply.send({ rate30yr: null, rate15yr: null, asOf: null });
    }
  });
}
