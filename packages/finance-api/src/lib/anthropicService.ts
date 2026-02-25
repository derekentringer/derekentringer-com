import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { AiInsight, AiInsightScope } from "@derekentringer/shared";
import { loadConfig } from "../config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const config = loadConfig();
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const INSIGHT_TOOL: Anthropic.Tool = {
  name: "record_financial_insights",
  description: "Record one or more financial insights based on the provided financial data.",
  input_schema: {
    type: "object" as const,
    properties: {
      insights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["observation", "recommendation", "alert", "celebration"],
              description: "The type of insight",
            },
            severity: {
              type: "string",
              enum: ["info", "warning", "success"],
              description: "Severity level: info for neutral, warning for concerns, success for positive",
            },
            title: {
              type: "string",
              description: "Short title for the insight (max 80 chars)",
            },
            body: {
              type: "string",
              description: "Detailed explanation with specific numbers (max 200 chars)",
            },
            relatedPage: {
              type: "string",
              description: "URL path to the most relevant page (e.g. /budgets, /goals)",
            },
          },
          required: ["type", "severity", "title", "body"],
        },
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ["insights"],
  },
};

const SYSTEM_PROMPT = `You are a personal finance analyst for a single user's finance dashboard. Analyze the provided financial data and generate actionable insights.

Rules:
- Be specific with dollar amounts and percentages — never vague
- Be concise — each insight should be 1-2 sentences max
- Be actionable — suggest concrete next steps when relevant
- Celebrate wins — acknowledge positive trends and milestones
- Never give tax, legal, or investment advice
- Never recommend specific financial products or services
- Focus on patterns, trends, and anomalies in the data
- Generate 2-4 insights per request, prioritizing the most impactful`;

const SCOPE_PROMPTS: Record<AiInsightScope, string> = {
  dashboard: "Analyze this dashboard overview and provide high-level financial insights about net worth, spending trends, debt-to-income ratio, and goal progress.",
  budget: "Analyze budget vs actual spending data across categories. Identify overspending, underspending, and 3-month trends.",
  goals: "Analyze financial goal progress. Identify goals at risk, celebrate progress, and suggest adjustments to monthly contributions.",
  spending: "Analyze spending patterns across categories and compare month-over-month trends.",
  accounts: "Analyze account balances, interest rates, and account types. Identify optimization opportunities.",
  projections: "Analyze financial projections and identify areas where the user can improve their financial trajectory.",
  "decision-tools": "Analyze the financial overview and suggest which decision tools might be most relevant.",
  "monthly-digest": "Create a final monthly financial summary for this completed month. Highlight key changes, spending patterns, budget adherence, and goal progress compared to the previous month. This is a permanent report for a closed period.",
  "quarterly-digest": "Create a final quarterly financial review for this completed quarter. Identify 3-month trends, significant changes, goal trajectory, and net worth growth. This is a permanent report for a closed period.",
  alerts: "Identify any concerning patterns, anomalies, or items that need immediate attention in the financial data.",
};

interface InsightToolInput {
  insights: Array<{
    type: string;
    severity: string;
    title: string;
    body: string;
    relatedPage?: string;
  }>;
}

function computeTTL(scope: AiInsightScope): Date {
  const now = new Date();
  switch (scope) {
    case "monthly-digest":
    case "quarterly-digest":
      // Digests are for completed periods and should never expire
      return new Date(now.getFullYear() + 10, 0, 1);
    case "alerts":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  }
}

export async function generateInsights(
  scope: AiInsightScope,
  contextData: Record<string, unknown>,
): Promise<{ insights: AiInsight[]; expiresAt: Date }> {
  const anthropic = getClient();

  const userPrompt = `${SCOPE_PROMPTS[scope]}\n\nFinancial data:\n${JSON.stringify(contextData, null, 2)}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [INSIGHT_TOOL],
    tool_choice: { type: "tool", name: "record_financial_insights" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("No tool_use block in Claude response");
  }

  const input = toolBlock.input as InsightToolInput;
  const now = new Date().toISOString();
  const expiresAt = computeTTL(scope);

  const insights: AiInsight[] = input.insights.map((raw) => ({
    id: randomUUID(),
    scope,
    type: raw.type as AiInsight["type"],
    severity: raw.severity as AiInsight["severity"],
    title: raw.title,
    body: raw.body,
    relatedPage: raw.relatedPage,
    generatedAt: now,
    expiresAt: expiresAt.toISOString(),
  }));

  return { insights, expiresAt };
}
