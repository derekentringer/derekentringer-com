import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";
import type { AudioMode } from "@derekentringer/shared/ns";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const config = loadConfig();
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/** Returns the configured Claude model ID (from CLAUDE_MODEL env var or default) */
function getModel(): string {
  return loadConfig().claudeModel;
}

export type CompletionStyle = "continue" | "markdown" | "brief" | "paragraph" | "structure";

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
  paragraph:
    "You are a writing assistant. Write the next full paragraph continuing the user's markdown text. Match the tone, style, and topic. Output only the paragraph, no commentary.",
  structure:
    "You are a document structure assistant. Based on the user's note title or opening text, suggest a markdown outline with headings (##) and brief placeholder descriptions. Output only the markdown structure, no commentary.",
};

const COMPLETION_MAX_TOKENS: Record<CompletionStyle, number> = {
  continue: 200,
  markdown: 200,
  brief: 50,
  paragraph: 500,
  structure: 500,
};

export async function* generateCompletion(
  context: string,
  signal?: AbortSignal,
  style: CompletionStyle = "continue",
): AsyncGenerator<string> {
  const anthropic = getClient();

  const stream = await anthropic.messages.create({
    model: getModel(),
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
    model: getModel(),
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
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    try {
      const response = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 100,
        temperature: 0.3,
        system: `You are a tagging assistant. Given a note's title and content, suggest 3-6 relevant tags. Prefer reusing existing tags when they fit, but always create new tags when the content covers topics not represented by existing tags. Existing tags in the system: ${JSON.stringify(existingTags)}. Return a JSON array of lowercase tag strings, e.g. ["tag1", "tag2"]. Output only the JSON array, nothing else.`,
        messages: [
          {
            role: "user",
            content: `Title: ${title}\n\nContent:\n${content}`,
          },
        ],
      });

      const block = response.content[0];
      if (block.type === "text") {
        const raw = block.text.trim();
        // Strip markdown code fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            return parsed.filter((t): t is string => typeof t === "string");
          }
        } catch {
          // If parsing fails, return empty array
        }
      }
      return [];
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status && RETRYABLE_STATUSES.includes(status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export async function rewriteText(
  text: string,
  action: RewriteAction,
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: getModel(),
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

const TRANSCRIPT_PROMPTS: Record<AudioMode, string> = {
  meeting:
    "You are a meeting notes assistant. Structure the transcript into meeting notes with: attendees (if mentioned), key discussion points, decisions made, and action items. Use markdown formatting. Output a JSON object with keys: title (short meeting title), content (structured markdown), tags (relevant tags array).",
  lecture:
    "You are a lecture notes assistant. Structure the transcript into organized notes with: key concepts, definitions, important points, and a summary. Use markdown formatting with headings and lists. Output a JSON object with keys: title (topic title), content (structured markdown), tags (relevant tags array).",
  memo:
    "You are a note-taking assistant. Clean up the transcript into a well-written memo. Keep the personal tone, fix grammar and filler words, organize into paragraphs. Output a JSON object with keys: title (brief title), content (cleaned-up markdown), tags (relevant tags array).",
  verbatim:
    "You are a transcription assistant. Minimally process the transcript: fix obvious errors, add punctuation and paragraph breaks, but keep the content as close to the original as possible. Output a JSON object with keys: title (brief title), content (cleaned transcription), tags (relevant tags array).",
};

const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = [502, 503, 504, 529];

/**
 * Maps Anthropic API error status codes to user-friendly messages.
 *
 * | HTTP | Anthropic Type         | User Message                                                        |
 * |------|------------------------|---------------------------------------------------------------------|
 * | 400  | invalid_request_error  | Unable to process your request. Please try again.                   |
 * | 401  | authentication_error   | AI service is temporarily unavailable. Please try again later.      |
 * | 402  | billing_error          | AI service is temporarily unavailable. Please try again later.      |
 * | 403  | permission_error       | AI service is temporarily unavailable. Please try again later.      |
 * | 404  | not_found_error        | AI service is temporarily unavailable. Please try again later.      |
 * | 413  | request_too_large      | Your request is too large. Try with a shorter transcript or note.   |
 * | 429  | rate_limit_error       | AI is busy right now. Please wait a moment and try again.           |
 * | 500  | api_error              | AI service encountered an error. Please try again.                  |
 * | 504  | timeout_error          | AI request timed out. Please try again with a shorter question.     |
 * | 529  | overloaded_error       | AI service is experiencing high demand. Please try again in a moment.|
 */
const AI_ERROR_MESSAGES: Record<number, string> = {
  400: "Unable to process your request. Please try again.",
  401: "AI service is temporarily unavailable. Please try again later.",
  402: "AI service is temporarily unavailable. Please try again later.",
  403: "AI service is temporarily unavailable. Please try again later.",
  404: "AI service is temporarily unavailable. Please try again later.",
  413: "Your request is too large. Try with a shorter transcript or note.",
  429: "AI is busy right now. Please wait a moment and try again.",
  500: "AI service encountered an error. Please try again.",
  504: "AI request timed out. Please try again with a shorter question.",
  529: "AI service is experiencing high demand. Please try again in a moment.",
};

const AI_DEFAULT_ERROR = "Something went wrong. Please try again.";

/** Extract a user-friendly error message from an Anthropic SDK error. */
export function getAiErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status && AI_ERROR_MESSAGES[status]) {
    return AI_ERROR_MESSAGES[status];
  }
  return AI_DEFAULT_ERROR;
}

export async function structureTranscript(
  transcript: string,
  mode: AudioMode,
): Promise<{ title: string; content: string; tags: string[] }> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    try {
      const response = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 8192,
        temperature: 0.3,
        system: TRANSCRIPT_PROMPTS[mode],
        messages: [{ role: "user", content: transcript }],
      });

      const block = response.content[0];
      if (block.type === "text") {
        try {
          // Strip markdown code fences if present (```json ... ```)
          let jsonText = block.text.trim();
          const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
          if (fenceMatch) {
            jsonText = fenceMatch[1].trim();
          }
          const parsed = JSON.parse(jsonText);
          return {
            title: typeof parsed.title === "string" ? parsed.title : "Audio Note",
            content: typeof parsed.content === "string" ? parsed.content : transcript,
            tags: Array.isArray(parsed.tags)
              ? parsed.tags.filter((t: unknown): t is string => typeof t === "string")
              : [],
          };
        } catch {
          return { title: "Audio Note", content: transcript, tags: [] };
        }
      }

      return { title: "Audio Note", content: transcript, tags: [] };
    } catch (err: unknown) {
      lastError = err;
      // Retry on transient API errors (502, 503, 504, 529 overloaded)
      const status = (err as { status?: number })?.status;
      if (status && RETRYABLE_STATUSES.includes(status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export interface NoteContext {
  id: string;
  title: string;
  content: string;
  imageDescriptions?: string[];
}

export async function* answerQuestion(
  question: string,
  noteContexts: NoteContext[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const anthropic = getClient();

  const contextBlock = noteContexts
    .map((n) => {
      let block = `## ${n.title}\n${n.content}`;
      if (n.imageDescriptions && n.imageDescriptions.length > 0) {
        block += `\n\n[Images in this note]\n${n.imageDescriptions.map((d) => `- ${d}`).join("\n")}`;
      }
      return block;
    })
    .join("\n\n---\n\n");

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    try {
      const stream = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 1000,
        temperature: 0.3,
        stream: true,
        system:
          "You are a Q&A assistant. Answer the user's question based ONLY on the provided notes. Cite sources by title in [brackets]. If the notes don't contain relevant information, say so.",
        messages: [
          {
            role: "user",
            content: `Notes:\n\n${contextBlock}\n\nQuestion: ${question}`,
          },
        ],
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
      return; // Stream completed successfully
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status && RETRYABLE_STATUSES.includes(status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export async function* answerMeetingQuestion(
  question: string,
  transcript: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    try {
      const stream = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 1000,
        temperature: 0.3,
        stream: true,
        system:
          "You are a meeting assistant. Answer the user's question based on the live meeting transcript provided. Be concise and helpful. If the transcript doesn't contain relevant information, say so.",
        messages: [
          {
            role: "user",
            content: `Meeting transcript:\n\n${transcript}\n\nQuestion: ${question}`,
          },
        ],
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
      return;
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status && RETRYABLE_STATUSES.includes(status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export interface AgentEvent {
  type: "tool_activity" | "note_cards" | "text" | "done" | "confirmation";
  toolName?: string;
  description?: string;
  noteCards?: { id: string; title: string; folder?: string; tags?: string[]; updatedAt?: string }[];
  text?: string;
  // Phase C: forwarded to the frontend when a destructive tool call is
  // awaiting user confirmation. The panel renders a ConfirmationCard.
  confirmation?: import("./assistantTools.js").PendingConfirmation;
}

export async function* answerWithTools(
  question: string,
  userId: string,
  signal?: AbortSignal,
  transcript?: string,
  activeNote?: { id: string; title: string; content: string },
  // Phase A (docs/ns/ai-assist-arch/phase-a-*): prior user/assistant
  // turns, already trimmed on the client. Text-only rehydration — we do
  // not re-send tool_use / tool_result blocks from earlier turns (our
  // persisted message schema doesn't preserve them, and Claude infers
  // fine from text alone for follow-ups like "summarize the second one").
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  // Phase C.5: per-tool auto-approve flags from user settings. When
  // set, destructive tools bypass the confirmation gate for this
  // request only. Missing flags default to false (confirmation on).
  autoApprove?: {
    deleteNote?: boolean;
    deleteFolder?: boolean;
    updateNoteContent?: boolean;
    renameFolder?: boolean;
    renameTag?: boolean;
  },
): AsyncGenerator<AgentEvent> {
  const { ASSISTANT_TOOLS, executeTool } = await import("./assistantTools.js");
  const anthropic = getClient();

  // Prepend prior turns so Claude has conversational context. The
  // current question is always the last user turn. Defensive: filter
  // any empty-content items the client might have leaked through.
  const priorTurns: Anthropic.MessageParam[] = (history ?? [])
    .filter((t) => t.content && t.content.trim().length > 0)
    .map((t) => ({ role: t.role, content: t.content }));

  const messages: Anthropic.MessageParam[] = [
    ...priorTurns,
    { role: "user", content: question },
  ];

  // Phase B.3 (docs/ns/ai-assist-arch/phase-b-*): raised from 3 → 5.
  // Legitimate multi-step chains (search → read 2 notes → synthesize with
  // a backlinks follow-up) hit 3 rounds too easily. 5 is a realistic
  // upper bound for complex-but-answerable questions.
  const MAX_ROUNDS = 5;
  // Belt-and-suspenders: one round could emit many tool_use blocks in
  // parallel. The cumulative cap halts runaway loops even if the round
  // counter hasn't tripped yet.
  const MAX_TOOL_CALLS_TOTAL = 12;
  let totalToolCalls = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return;

    const response = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 1500,
      temperature: 0.3,
      system: `You are a helpful note-taking assistant. Use the provided tools to search, create, move, tag, summarize, and delete the user's notes and folders. Be concise and helpful. When referencing notes, use their exact titles. If a tool returns note cards, the UI will display them as interactive elements — you don't need to repeat every detail, just summarize naturally. When creating notes, generate useful structured content based on the user's request. For destructive actions like deleting, confirm what you did clearly.

When to reach for search_notes: any question that could be answered from the user's broader note library, not just the active note or the live transcript. Examples: "what have I written about X", "do I have any notes on Y", "summarize my thoughts on Z", "how have I described A". Default to mode=hybrid so semantically related notes surface even when exact wording differs. The tool returns content snippets — answer from those directly; only call get_note_content when you need the full text of a specific matched note. If the user's question is clearly scoped to the currently open note or live transcript, answer from that context without searching.

Destructive actions (delete_note, delete_folder, update_note_content, rename_folder, rename_tag) are gated by a user confirmation card that appears in the chat. When you invoke one of these tools, the tool_result will say "User confirmation requested…" — this means your call has NOT yet been executed; it's waiting on the user to click Apply or Discard. Compose your reply as if you've proposed the change rather than completed it (e.g. "I've queued up the deletion — click Apply on the card to confirm"). Don't invoke the same destructive tool a second time; the card is already visible.

The user also has slash commands available as a faster alternative for the same actions (no AI cost). You can mention these as tips when relevant:
/open, /create, /move, /tag, /delete, /deletefolder, /summarize, /gentags, /favorites, /favorite, /unfavorite, /trash, /restore, /renamefolder, /renametag, /duplicate, /recent, /folders, /tags, /stats, /clear

If the user asks what you can do or asks for help, explain your capabilities: searching notes, answering questions about note content, finding connections between notes, creating notes with templates, moving/tagging/deleting notes, generating summaries and tags, and showing statistics. Also mention that slash commands are available as a free, instant alternative.${activeNote ? `

The user currently has the note "${activeNote.title}" (id: ${activeNote.id}) open in the editor. When they say "this note", "the current note", "this document", or similar, they are referring to this note. Here is its content:

${activeNote.content.slice(0, 10000)}` : ""}${transcript ? `

The user is currently in a live recording session. Below is the live transcript of the meeting/recording so far. You can answer questions about what's being discussed using this transcript, AND you can use your tools to search, create, or manage notes. Use your judgment — if the question is about the meeting content, answer from the transcript. If the question is about the user's notes or requires an action, use tools.

Live transcript:
${transcript}` : ""}`,
      tools: ASSISTANT_TOOLS,
      messages,
    });

    // Collect all content blocks
    const toolUseBlocks: Anthropic.ContentBlockParam[] = [];
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        yield { type: "text", text: block.text };
      } else if (block.type === "tool_use") {
        hasToolUse = true;

        // Total-call cap: if already at the limit, refuse the tool and
        // synthesize an error result so Claude can wrap up with its
        // remaining output budget instead of just cutting off.
        if (totalToolCalls >= MAX_TOOL_CALLS_TOTAL) {
          toolUseBlocks.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Tool-call limit reached for this question. Please finish answering with the information already gathered, or the user can refine the question and try again.",
            is_error: true,
          });
          continue;
        }
        totalToolCalls++;

        const toolDescription = describeToolCall(block.name, block.input as Record<string, unknown>);
        yield { type: "tool_activity", toolName: block.name, description: toolDescription };

        // Phase C.5: consult per-tool auto-approve flags. The tool
        // name maps into an autoApprove key; missing or false → gate on.
        const toolAutoApprove = shouldAutoApproveTool(block.name, autoApprove);
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          userId,
          { autoApprove: toolAutoApprove },
        );

        if (result.noteCards && result.noteCards.length > 0) {
          yield { type: "note_cards", noteCards: result.noteCards };
        }

        // Phase C: relay the pending confirmation to the frontend
        // as an SSE event. Claude also sees `result.text` saying
        // confirmation was requested (so it can phrase its response
        // naturally), but doesn't see the `needsConfirmation` payload
        // itself — that's a UI-only concern.
        if (result.needsConfirmation) {
          yield { type: "confirmation", confirmation: result.needsConfirmation };
        }

        toolUseBlocks.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.text,
        });
      }
    }

    if (!hasToolUse) {
      // No more tool calls — we're done
      yield { type: "done" };
      return;
    }

    // Add assistant's tool_use response and our tool_results to the conversation
    messages.push({ role: "assistant", content: [...toolUseBlocks] });
    messages.push({ role: "user", content: [...toolResultBlocks] });
  }

  yield { type: "done" };
}

/** Phase C.5: map tool name → auto-approve flag from the user's settings. */
function shouldAutoApproveTool(
  toolName: string,
  flags?: {
    deleteNote?: boolean;
    deleteFolder?: boolean;
    updateNoteContent?: boolean;
    renameFolder?: boolean;
    renameTag?: boolean;
  },
): boolean {
  if (!flags) return false;
  switch (toolName) {
    case "delete_note": return flags.deleteNote === true;
    case "delete_folder": return flags.deleteFolder === true;
    case "update_note_content": return flags.updateNoteContent === true;
    case "rename_folder": return flags.renameFolder === true;
    case "rename_tag": return flags.renameTag === true;
    default: return false;
  }
}

function describeToolCall(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "search_notes": {
      const parts: string[] = [];
      if (input.favorite) parts.push("favorite");
      if (input.tag) parts.push(`tagged "${input.tag}"`);
      if (input.folder) parts.push(`in "${input.folder}"`);
      if (input.audioMode) parts.push(`${input.audioMode} recordings`);
      if (input.query) parts.push(`matching "${input.query}"`);
      return parts.length > 0 ? `Searching ${parts.join(", ")} notes...` : "Searching notes...";
    }
    case "list_folders":
      return "Looking up folder structure...";
    case "list_tags":
      return "Fetching tags...";
    case "get_note_stats":
      return "Getting note statistics...";
    case "get_recent_notes":
      return "Finding recently edited notes...";
    case "get_note_content":
      return `Reading "${input.title}"...`;
    case "find_similar_notes":
      return `Finding notes similar to "${input.noteTitle}"...`;
    case "get_backlinks":
      return `Finding links to "${input.noteTitle}"...`;
    case "open_note":
      return `Opening "${input.noteTitle}"...`;
    case "create_note":
      return `Creating note "${input.title}"...`;
    case "update_note_content":
      return `Updating "${input.noteTitle}"...`;
    case "move_note":
      return `Moving "${input.noteTitle}" to "${input.folderName}"...`;
    case "tag_note":
      return `Tagging "${input.noteTitle}"...`;
    case "generate_tags":
      return `Generating tags for "${input.noteTitle}"...`;
    case "generate_summary":
      return `Summarizing "${input.noteTitle}"...`;
    case "delete_note":
      return `Deleting "${input.noteTitle}"...`;
    case "delete_folder":
      return `Deleting folder "${input.folderName}"...`;
    case "toggle_favorite":
      return input.favorite ? `Adding "${input.noteTitle}" to favorites...` : `Removing "${input.noteTitle}" from favorites...`;
    case "list_trash":
      return "Checking trash...";
    case "restore_note":
      return `Restoring "${input.noteTitle}" from trash...`;
    case "rename_folder":
      return `Renaming folder "${input.oldName}" to "${input.newName}"...`;
    case "rename_tag":
      return `Renaming tag "${input.oldName}" to "${input.newName}"...`;
    case "duplicate_note":
      return `Duplicating "${input.noteTitle}"...`;
    default:
      return "Processing...";
  }
}

export async function analyzeImage(
  base64: string,
  mimeType: string,
): Promise<string> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    try {
      const response = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 300,
        temperature: 0.3,
        system:
          "You are an image analysis assistant. Describe the image contents in detail for search indexing. Include text visible in the image, objects, diagrams, charts, people, colors, and layout. Be thorough but concise (2-5 sentences). Output only the description.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: base64,
                },
              },
              { type: "text", text: "Describe this image." },
            ],
          },
        ],
      });

      const block = response.content[0];
      if (block.type === "text") {
        return block.text.trim();
      }
      return "";
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status && RETRYABLE_STATUSES.includes(status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/** Reset client (for testing only) */
export function resetClient(): void {
  client = null;
}
