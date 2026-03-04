import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const config = loadConfig();
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export type CompletionStyle = "continue" | "markdown" | "brief";

export type RewriteAction =
  | "rewrite"
  | "concise"
  | "fix-grammar"
  | "to-list"
  | "expand"
  | "summarize";

const REWRITE_PROMPTS: Record<RewriteAction, string> = {
  rewrite:
    "You are a writing assistant. Rewrite the user's text to improve clarity and flow while preserving the original meaning. Output only the rewritten text, no commentary.",
  concise:
    "You are a writing assistant. Make the user's text more concise by removing unnecessary words and tightening the prose. Output only the concise text, no commentary.",
  "fix-grammar":
    "You are a grammar assistant. Fix any grammar, spelling, and punctuation errors in the user's text. Output only the corrected text, no commentary.",
  "to-list":
    "You are a formatting assistant. Convert the user's text into a markdown bulleted list. Output only the list, no commentary.",
  expand:
    "You are a writing assistant. Expand the user's text with more detail, examples, or explanation while maintaining the original tone. Output only the expanded text, no commentary.",
  summarize:
    "You are a summarization assistant. Summarize the user's text into a concise version. Output only the summary, no commentary.",
};

const REWRITE_MAX_TOKENS: Record<RewriteAction, number> = {
  rewrite: 500,
  concise: 300,
  "fix-grammar": 500,
  "to-list": 500,
  expand: 800,
  summarize: 200,
};

const COMPLETION_PROMPTS: Record<CompletionStyle, string> = {
  continue:
    "You are a writing assistant. Continue the user's markdown text naturally. Output only the continuation, no commentary.",
  markdown:
    "You are a markdown formatting assistant. Help the user with markdown syntax — suggest tables, code blocks, links, lists, headings, or other formatting based on context. Output only the markdown, no commentary.",
  brief:
    "You are a writing assistant. Complete the user's current thought with just a few words (at most one short sentence). Output only the brief completion, no commentary.",
};

const COMPLETION_MAX_TOKENS: Record<CompletionStyle, number> = {
  continue: 200,
  markdown: 200,
  brief: 50,
};

export async function* generateCompletion(
  context: string,
  signal?: AbortSignal,
  style: CompletionStyle = "continue",
): AsyncGenerator<string> {
  const anthropic = getClient();

  const stream = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: COMPLETION_MAX_TOKENS[style],
    temperature: 0.7,
    stream: true,
    system: COMPLETION_PROMPTS[style],
    messages: [{ role: "user", content: context }],
  });

  for await (const event of stream) {
    if (signal?.aborted) return;
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

export async function generateSummary(
  title: string,
  content: string,
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 150,
    temperature: 0.3,
    system:
      "You are a summarization assistant. Given a note's title and content, produce a concise 1-3 sentence summary. Output only the summary, no commentary.",
    messages: [
      {
        role: "user",
        content: `Title: ${title}\n\nContent:\n${content}`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type === "text") {
    return block.text.trim();
  }
  return "";
}

export async function suggestTags(
  title: string,
  content: string,
  existingTags: string[],
): Promise<string[]> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    temperature: 0.3,
    system: `You are a tagging assistant. Given a note's title and content, suggest relevant tags. Reuse existing tags when applicable. Existing tags in the system: ${JSON.stringify(existingTags)}. Return a JSON array of tag strings, e.g. ["tag1", "tag2"]. Output only the JSON array, nothing else.`,
    messages: [
      {
        role: "user",
        content: `Title: ${title}\n\nContent:\n${content}`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type === "text") {
    try {
      const parsed = JSON.parse(block.text.trim());
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // If parsing fails, return empty array
    }
  }
  return [];
}

export async function rewriteText(
  text: string,
  action: RewriteAction,
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: REWRITE_MAX_TOKENS[action],
    temperature: 0.3,
    system: REWRITE_PROMPTS[action],
    messages: [{ role: "user", content: text }],
  });

  const block = response.content[0];
  if (block.type === "text") {
    return block.text.trim();
  }
  return "";
}

/** Reset client (for testing only) */
export function resetClient(): void {
  client = null;
}
