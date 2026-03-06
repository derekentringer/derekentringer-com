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
import {
  ensureInsightStatuses,
  markInsightsRead,
  markInsightsDismissed,
  getInsightStatuses,
  getUnseenCounts,
  getArchive,
} from "../store/aiInsightStatusStore.js";
import { buildContextForScope } from "../store/aiContextStore.js";
import { generateInsights } from "../lib/anthropicService.js";
import { getSetting } from "../store/settingStore.js";

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

  // Check if AI is globally disabled by admin
  fastify.addHook("onRequest", async (_request, reply) => {
    const aiEnabled = await getSetting("aiEnabled");
    if (aiEnabled === "false") {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "AI features are currently disabled",
      });
    }
  });

  // GET /preferences
  fastify.get(
    "/preferences",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const userId = _request.user.sub;
      const preferences = await getAiPreferences(userId);
      const dailyRequestsUsed = await getDailyUsage(userId);
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
      const userId = request.user.sub;
      const preferences = await updateAiPreferences(userId, request.body);
      const dailyRequestsUsed = await getDailyUsage(userId);
      return reply.send({ preferences, dailyRequestsUsed, dailyRequestsLimit: DAILY_LIMIT });
    },
  );

  // DELETE /cache
  fastify.delete(
    "/cache",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const scope = (request.query as Record<string, string>).scope;
      const cleared = await clearInsightCache(userId, scope || undefined);
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
      const userId = request.user.sub;
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
      const prefs = await getAiPreferences(userId);
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
      const context = await buildContextForScope(userId, scope, { month, quarter });

      // 6. Check cache
      const cached = await getCachedInsights(userId, scope, context.contentHash);
      if (cached) {
        await ensureInsightStatuses(userId, cached);
        const [dailyRequestsUsed, statuses] = await Promise.all([
          getDailyUsage(userId),
          getInsightStatuses(userId, cached.map((i) => i.id)),
        ]);
        return reply.send({
          insights: cached,
          cached: true,
          dailyRequestsUsed,
          dailyRequestsLimit: DAILY_LIMIT,
          statuses,
        });
      }

      // 7. Check daily usage
      const usage = await getDailyUsage(userId);
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
      await setCachedInsights(userId, scope, context.contentHash, insights, expiresAt);

      // 10. Increment usage & create status rows
      const [dailyRequestsUsed] = await Promise.all([
        incrementDailyUsage(userId),
        ensureInsightStatuses(userId, insights),
      ]);

      // 11. Get statuses for response
      const statuses = await getInsightStatuses(userId, insights.map((i) => i.id));

      return reply.send({
        insights,
        cached: false,
        dailyRequestsUsed,
        dailyRequestsLimit: DAILY_LIMIT,
        statuses,
      });
    },
  );

  // POST /insights/mark-read
  fastify.post<{ Body: { insightIds: string[] } }>(
    "/insights/mark-read",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["insightIds"],
          properties: {
            insightIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { insightIds: string[] } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      await markInsightsRead(userId, request.body.insightIds);
      return reply.send({ ok: true });
    },
  );

  // POST /insights/mark-dismissed
  fastify.post<{ Body: { insightIds: string[] } }>(
    "/insights/mark-dismissed",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["insightIds"],
          properties: {
            insightIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { insightIds: string[] } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      await markInsightsDismissed(userId, request.body.insightIds);
      return reply.send({ ok: true });
    },
  );

  // GET /insights/unseen-count
  fastify.get(
    "/insights/unseen-count",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const userId = _request.user.sub;
      const counts = await getUnseenCounts(userId);
      return reply.send(counts);
    },
  );

  // GET /insights/archive
  fastify.get(
    "/insights/archive",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const query = request.query as Record<string, string>;
      const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
      const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
      const result = await getArchive(userId, limit, offset);
      return reply.send(result);
    },
  );
}
