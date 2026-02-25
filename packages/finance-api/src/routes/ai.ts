import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AiInsightScope, UpdateAiInsightPreferencesRequest, AiInsightsRequest } from "@derekentringer/shared";
import { loadConfig } from "../config.js";
import {
  getAiPreferences,
  updateAiPreferences,
  getCachedInsights,
  setCachedInsights,
  clearInsightCache,
  getDailyUsage,
  incrementDailyUsage,
} from "../store/aiInsightStore.js";
import { buildContextForScope } from "../store/aiContextStore.js";
import { generateInsights } from "../lib/anthropicService.js";

const DAILY_LIMIT = 10;

const VALID_SCOPES = new Set<AiInsightScope>([
  "dashboard", "budget", "goals", "spending", "accounts",
  "projections", "decision-tools", "monthly-digest", "quarterly-digest", "alerts",
]);

const SCOPE_TO_FEATURE: Record<AiInsightScope, string> = {
  dashboard: "dashboardCard",
  budget: "pageNudges",
  goals: "pageNudges",
  spending: "pageNudges",
  accounts: "pageNudges",
  projections: "pageNudges",
  "decision-tools": "pageNudges",
  "monthly-digest": "monthlyDigest",
  "quarterly-digest": "quarterlyDigest",
  alerts: "smartAlerts",
};

const updatePreferencesSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    minProperties: 1,
    properties: {
      masterEnabled: { type: "boolean" },
      dashboardCard: { type: "boolean" },
      monthlyDigest: { type: "boolean" },
      quarterlyDigest: { type: "boolean" },
      pageNudges: { type: "boolean" },
      smartAlerts: { type: "boolean" },
      refreshFrequency: { type: "string", enum: ["weekly", "daily", "on_data_change"] },
    },
  },
};

const insightsSchema = {
  body: {
    type: "object" as const,
    required: ["scope"],
    additionalProperties: false,
    properties: {
      scope: { type: "string" },
      month: { type: "string" },
      quarter: { type: "string" },
    },
  },
};

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /preferences
  fastify.get(
    "/preferences",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const preferences = await getAiPreferences();
      const dailyRequestsUsed = await getDailyUsage();
      return reply.send({ preferences, dailyRequestsUsed, dailyRequestsLimit: DAILY_LIMIT });
    },
  );

  // PUT /preferences
  fastify.put<{ Body: UpdateAiInsightPreferencesRequest }>(
    "/preferences",
    { schema: updatePreferencesSchema },
    async (
      request: FastifyRequest<{ Body: UpdateAiInsightPreferencesRequest }>,
      reply: FastifyReply,
    ) => {
      const preferences = await updateAiPreferences(request.body);
      const dailyRequestsUsed = await getDailyUsage();
      return reply.send({ preferences, dailyRequestsUsed, dailyRequestsLimit: DAILY_LIMIT });
    },
  );

  // DELETE /cache
  fastify.delete(
    "/cache",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scope = (request.query as Record<string, string>).scope;
      const cleared = await clearInsightCache(scope || undefined);
      return reply.send({ cleared });
    },
  );

  // POST /insights
  fastify.post<{ Body: AiInsightsRequest }>(
    "/insights",
    {
      schema: insightsSchema,
      config: {
        rateLimit: { max: 3, timeWindow: "1 minute" },
      },
    },
    async (
      request: FastifyRequest<{ Body: AiInsightsRequest }>,
      reply: FastifyReply,
    ) => {
      const { scope, month, quarter } = request.body;

      // 1. Validate scope
      if (!VALID_SCOPES.has(scope)) {
        return reply.status(400).send({ error: "Invalid scope" });
      }

      // 1b. Digests are only for completed periods
      if (scope === "monthly-digest") {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        if (month && month >= currentMonth) {
          return reply.status(400).send({
            error: "Period not yet complete",
            message: "Monthly digests are only available for completed months.",
          });
        }
      }
      if (scope === "quarterly-digest") {
        const now = new Date();
        const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
        if (quarter && quarter >= currentQuarter) {
          return reply.status(400).send({
            error: "Period not yet complete",
            message: "Quarterly digests are only available for completed quarters.",
          });
        }
      }

      // 2. Check API key
      const config = loadConfig();
      if (!config.anthropicApiKey) {
        return reply.status(503).send({
          error: "AI insights are not configured",
          message: "ANTHROPIC_API_KEY is not set",
        });
      }

      // 3. Check master enabled
      const prefs = await getAiPreferences();
      if (!prefs.masterEnabled) {
        return reply.status(403).send({
          error: "AI insights are disabled",
          message: "Enable AI insights in Settings to use this feature",
        });
      }

      // 4. Check per-feature toggle
      const featureKey = SCOPE_TO_FEATURE[scope] as keyof typeof prefs;
      if (featureKey && !prefs[featureKey]) {
        return reply.status(403).send({
          error: "This insight type is disabled",
          message: `Enable ${featureKey} in Settings > AI Insights`,
        });
      }

      // 5. Build context
      const context = await buildContextForScope(scope, { month, quarter });

      // 6. Check cache
      const cached = await getCachedInsights(scope, context.contentHash);
      if (cached) {
        const dailyRequestsUsed = await getDailyUsage();
        return reply.send({
          insights: cached,
          cached: true,
          dailyRequestsUsed,
          dailyRequestsLimit: DAILY_LIMIT,
        });
      }

      // 7. Check daily usage
      const usage = await getDailyUsage();
      if (usage >= DAILY_LIMIT) {
        return reply.status(429).send({
          error: "Daily AI request limit reached",
          message: `You've used all ${DAILY_LIMIT} daily requests. Limits reset at midnight.`,
          dailyRequestsUsed: usage,
          dailyRequestsLimit: DAILY_LIMIT,
        });
      }

      // 8. Generate insights
      const { insights, expiresAt } = await generateInsights(scope, context.data);

      // 9. Cache the result
      await setCachedInsights(scope, context.contentHash, insights, expiresAt);

      // 10. Increment usage
      const dailyRequestsUsed = await incrementDailyUsage();

      return reply.send({
        insights,
        cached: false,
        dailyRequestsUsed,
        dailyRequestsLimit: DAILY_LIMIT,
      });
    },
  );
}
