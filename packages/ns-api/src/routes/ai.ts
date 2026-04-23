import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateCompletion,
  generateSummary,
  suggestTags,
  rewriteText,
  structureTranscript,
  answerQuestion,
  answerWithTools,
  getAiErrorMessage,
} from "../services/aiService.js";
import { transcribeAudio, transcribeAudioChunked } from "../services/whisperService.js";
import { getNote, updateNote, createNote, findRelevantNotes, findMeetingContextNotes } from "../store/noteStore.js";
import { listTags } from "../store/noteStore.js";
import { toNote } from "../lib/mappers.js";
import { getChatHistory, appendChatMessages, clearChatHistory } from "../store/chatStore.js";
import type { AudioMode } from "@derekentringer/shared/ns";
import { getImagesByNoteIds } from "../store/imageStore.js";
import {
  isEmbeddingEnabled,
  setEmbeddingEnabled,
  getSetting,
} from "../store/settingStore.js";
import { processAllPendingEmbeddings } from "../services/embeddingProcessor.js";
import { getPrisma } from "../lib/prisma.js";
import { generateEmbedding, generateQueryEmbedding } from "../services/embeddingService.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const completeSchema = {
  body: {
    type: "object" as const,
    required: ["context"],
    additionalProperties: false,
    properties: {
      context: { type: "string", minLength: 1 },
      style: { type: "string", enum: ["continue", "markdown", "brief", "paragraph", "structure"] },
    },
  },
};

const askSchema = {
  body: {
    type: "object" as const,
    required: ["question"],
    additionalProperties: false,
    properties: {
      question: { type: "string", minLength: 1, maxLength: 2000 },
      transcript: { type: "string", maxLength: 50000 },
      activeNote: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          content: { type: "string", maxLength: 50000 },
        },
      },
      // Phase A (docs/ns/ai-assist-arch/phase-a-*): prior user/assistant
      // turns, already trimmed on the client to a reasonable budget.
      // Max 50 turns × 5000 chars = 250k chars upper bound (schema-level
      // defense; client-side typically sends ≤ 40 turns / 20k chars).
      history: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          required: ["role", "content"],
          additionalProperties: false,
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string", maxLength: 5000 },
          },
        },
      },
    },
  },
};

const summarizeSchema = {
  body: {
    type: "object" as const,
    required: ["noteId"],
    additionalProperties: false,
    properties: {
      noteId: { type: "string", minLength: 1 },
    },
  },
};

const tagsSchema = {
  body: {
    type: "object" as const,
    required: ["noteId"],
    additionalProperties: false,
    properties: {
      noteId: { type: "string", minLength: 1 },
    },
  },
};

const rewriteSchema = {
  body: {
    type: "object" as const,
    required: ["text", "action"],
    additionalProperties: false,
    properties: {
      text: { type: "string", minLength: 1, maxLength: 10000 },
      action: {
        type: "string",
        enum: [
          "rewrite",
          "concise",
          "fix-grammar",
          "to-list",
          "expand",
          "summarize",
        ],
      },
    },
  },
};

const VALID_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/webm",
]);

const VALID_MODES: AudioMode[] = ["meeting", "lecture", "memo", "verbatim"];

function validateAudioMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) return false;

  switch (mimetype) {
    case "audio/webm":
    case "video/webm":
      // WebM/EBML: 0x1A 0x45 0xDF 0xA3
      return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;

    case "audio/mp4":
      // MP4: "ftyp" at offset 4
      return buffer.toString("ascii", 4, 8) === "ftyp";

    case "audio/mpeg":
      // ID3 tag or MPEG sync word
      return (
        (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || // ID3
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) // MPEG sync
      );

    case "audio/wav":
      // RIFF at 0 + WAVE at 8
      return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";

    case "audio/ogg":
      // OggS at 0
      return buffer.toString("ascii", 0, 4) === "OggS";

    default:
      return false;
  }
}

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // Check if AI is globally enabled by admin
  fastify.addHook("onRequest", async (_request, reply) => {
    const aiEnabled = await getSetting("aiEnabled");
    if (aiEnabled === "false") {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "AI features disabled by administrator",
      });
    }
  });

  // POST /ai/complete — SSE streaming
  fastify.post<{ Body: { context: string; style?: string } }>(
    "/complete",
    { schema: completeSchema },
    async (
      request: FastifyRequest<{ Body: { context: string; style?: string } }>,
      reply: FastifyReply,
    ) => {
      const { context, style } = request.body;

      const abortController = new AbortController();
      const passthrough = new PassThrough();

      // Detect client disconnect via the underlying socket
      request.raw.socket.on("close", () => {
        abortController.abort();
      });

      // Drive the stream in the background — write to passthrough as chunks arrive
      (async () => {
        try {
          for await (const chunk of generateCompletion(
            context,
            abortController.signal,
            (style as "continue" | "markdown" | "brief" | "paragraph" | "structure") ?? "continue",
          )) {
            if (abortController.signal.aborted) break;
            passthrough.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            request.log.error(error, "AI completion error");
            passthrough.write(
              `data: ${JSON.stringify({ error: getAiErrorMessage(error) })}\n\n`,
            );
          }
        }
        passthrough.write("data: [DONE]\n\n");
        passthrough.end();
      })();

      return reply
        .type("text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .send(passthrough);
    },
  );

  // POST /ai/ask — SSE streaming Q&A
  type AskBody = {
    question: string;
    transcript?: string;
    activeNote?: { id: string; title: string; content: string };
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  fastify.post<{ Body: AskBody }>(
    "/ask",
    { schema: askSchema },
    async (
      request: FastifyRequest<{ Body: AskBody }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { question, transcript, activeNote, history } = request.body;
      const hasMeetingTranscript = transcript && transcript.trim().length > 0;

      const abortController = new AbortController();
      const passthrough = new PassThrough();

      request.raw.socket.on("close", () => {
        abortController.abort();
      });

      (async () => {
        try {
          passthrough.write(
            `data: ${JSON.stringify({ sources: [] })}\n\n`,
          );

          // Accumulate note cards across tool rounds so they persist with the final response
          const allNoteCards: { id: string; title: string; folder?: string; tags?: string[]; updatedAt?: string }[] = [];

          for await (const event of answerWithTools(
            question,
            userId,
            abortController.signal,
            hasMeetingTranscript ? transcript : undefined,
            activeNote,
            history,
          )) {
            if (abortController.signal.aborted) break;
            if (event.type === "text") {
              passthrough.write(
                `data: ${JSON.stringify({ text: event.text })}\n\n`,
              );
            } else if (event.type === "tool_activity") {
              passthrough.write(
                `data: ${JSON.stringify({ tool: { name: event.toolName, description: event.description } })}\n\n`,
              );
            } else if (event.type === "note_cards") {
              allNoteCards.push(...(event.noteCards ?? []));
              passthrough.write(
                `data: ${JSON.stringify({ noteCards: event.noteCards })}\n\n`,
              );
            }
          }

          // Re-send accumulated note cards at the end to ensure they persist
          if (allNoteCards.length > 0) {
            passthrough.write(
              `data: ${JSON.stringify({ noteCards: allNoteCards })}\n\n`,
            );
          }

          // Notify sync so UI refreshes after any tool-based write operations
          fastify.sseHub.notify(userId);
        } catch (error) {
          if (!abortController.signal.aborted) {
            request.log.error(error, "AI ask error");
            passthrough.write(
              `data: ${JSON.stringify({ error: getAiErrorMessage(error) })}\n\n`,
            );
          }
        }
        passthrough.write("data: [DONE]\n\n");
        passthrough.end();
      })();

      return reply
        .type("text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .send(passthrough);
    },
  );

  // POST /ai/summarize — JSON
  fastify.post<{ Body: { noteId: string } }>(
    "/summarize",
    { schema: summarizeSchema },
    async (
      request: FastifyRequest<{ Body: { noteId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { noteId } = request.body;

      if (!UUID_REGEX.test(noteId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(userId, noteId);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      const summary = await generateSummary(note.title, note.content);

      await updateNote(userId, noteId, { summary });

      return reply.send({ summary });
    },
  );

  // POST /ai/tags — JSON
  fastify.post<{ Body: { noteId: string } }>(
    "/tags",
    { schema: tagsSchema },
    async (
      request: FastifyRequest<{ Body: { noteId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { noteId } = request.body;

      if (!UUID_REGEX.test(noteId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(userId, noteId);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      const existingTags = await listTags(userId);
      const tagNames = existingTags.map((t) => t.name);

      const suggestedTags = await suggestTags(
        note.title,
        note.content,
        tagNames,
      );

      return reply.send({ tags: suggestedTags });
    },
  );

  // POST /ai/rewrite — JSON
  fastify.post<{ Body: { text: string; action: string } }>(
    "/rewrite",
    { schema: rewriteSchema },
    async (
      request: FastifyRequest<{ Body: { text: string; action: string } }>,
      reply: FastifyReply,
    ) => {
      const { text, action } = request.body;

      const result = await rewriteText(
        text,
        action as
          | "rewrite"
          | "concise"
          | "fix-grammar"
          | "to-list"
          | "expand"
          | "summarize",
      );

      return reply.send({ text: result });
    },
  );

  // POST /ai/structure-transcript — structure pre-transcribed text and create a note
  fastify.post<{ Body: { transcript: string; mode: string; folderId?: string } }>(
    "/structure-transcript",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["transcript", "mode"],
          additionalProperties: false,
          properties: {
            transcript: { type: "string", minLength: 1 },
            mode: { type: "string", enum: ["meeting", "lecture", "memo", "verbatim"] },
            folderId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { transcript, mode, folderId } = request.body;

      let structured: { title: string; content: string; tags: string[] };
      try {
        structured = await structureTranscript(transcript, mode as AudioMode);
      } catch (err) {
        request.log.error(err, "Transcript structuring failed");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: getAiErrorMessage(err),
        });
      }

      // Phase 3.5 — see `/ai/transcribe` above for the atomicity
      // rationale. Consistent error shape on createNote failure.
      let noteRow;
      try {
        noteRow = await createNote(userId, {
          title: structured.title,
          content: structured.content,
          tags: structured.tags,
          audioMode: mode as AudioMode,
          folderId,
        });
      } catch (err) {
        request.log.error(err, "Note creation failed after transcript structuring");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: err instanceof Error ? err.message : "Failed to create note",
        });
      }

      const note = toNote(noteRow);

      return reply.send({
        title: structured.title,
        content: structured.content,
        tags: structured.tags,
        note,
      });
    },
  );

  // POST /ai/meeting-context — find notes relevant to live meeting transcript
  fastify.post<{ Body: { transcript: string; excludeNoteIds?: string[]; threshold?: number } }>(
    "/meeting-context",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["transcript"],
          additionalProperties: false,
          properties: {
            transcript: { type: "string", minLength: 10 },
            excludeNoteIds: { type: "array", items: { type: "string" } },
            threshold: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { transcript, excludeNoteIds, threshold } = request.body;

      try {
        request.log.info(
          { transcriptLength: transcript.length },
          "Finding meeting context notes",
        );

        const results = await findMeetingContextNotes(
          userId,
          transcript,
          10,
          threshold ?? 0.65,
        );

        // Filter out excluded notes (already shown to the user)
        const excludeSet = new Set(excludeNoteIds ?? []);
        const filtered = results.filter((n) => !excludeSet.has(n.id));

        return reply.send({
          relevantNotes: filtered,
        });
      } catch (err) {
        request.log.error(err, "Meeting context search failed");
        const message = err instanceof Error ? err.message : "Context search failed";
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message,
        });
      }
    },
  );

  // POST /ai/transcribe-chunk — transcribe a single audio chunk (for live meeting transcription)
  fastify.post(
    "/transcribe-chunk",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let file;
      let sessionId = "";
      let chunkIndex = -1;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "sessionId") {
            sessionId = (part.value as string) || "";
          } else if (part.type === "field" && part.fieldname === "chunkIndex") {
            const val = parseInt(part.value as string, 10);
            if (!isNaN(val)) chunkIndex = val;
          } else if (part.type === "file" && part.fieldname === "file") {
            file = {
              buffer: await part.toBuffer(),
              filename: part.filename,
              mimetype: part.mimetype,
            };
          }
        }
      } catch {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid multipart data",
        });
      }

      if (!file) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No audio file provided",
        });
      }

      if (!sessionId || chunkIndex < 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "sessionId and chunkIndex are required",
        });
      }

      if (!VALID_AUDIO_TYPES.has(file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Unsupported audio type: ${file.mimetype}`,
        });
      }

      if (!validateAudioMagicBytes(file.buffer, file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "File content does not match declared audio type",
        });
      }

      let text: string;
      try {
        request.log.info(
          { sessionId, chunkIndex, fileSize: file.buffer.length, mimetype: file.mimetype },
          "Transcribing audio chunk",
        );
        text = await transcribeAudio(file.buffer, file.filename);
      } catch (err) {
        request.log.error(err, "Chunk transcription failed");
        const message = err instanceof Error ? err.message : "Transcription failed";
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message,
        });
      }

      return reply.send({ sessionId, chunkIndex, text });
    },
  );

  // POST /ai/transcribe — multipart/form-data
  fastify.post(
    "/transcribe",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      let file;
      let mode: AudioMode = "memo";
      let folderId: string | undefined;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "mode") {
            const val = (part.value as string) || "memo";
            if (VALID_MODES.includes(val as AudioMode)) {
              mode = val as AudioMode;
            }
          } else if (part.type === "field" && part.fieldname === "folderId") {
            const val = (part.value as string) || "";
            if (val) folderId = val;
          } else if (part.type === "file" && part.fieldname === "file") {
            file = {
              buffer: await part.toBuffer(),
              filename: part.filename,
              mimetype: part.mimetype,
            };
          }
        }
      } catch {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid multipart data",
        });
      }

      if (!file) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No audio file provided",
        });
      }

      if (!VALID_AUDIO_TYPES.has(file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Unsupported audio type: ${file.mimetype}`,
        });
      }

      if (!validateAudioMagicBytes(file.buffer, file.mimetype)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "File content does not match declared audio type",
        });
      }

      let transcript: string;
      try {
        request.log.info(
          { fileSize: file.buffer.length, mimetype: file.mimetype, mode },
          "Starting transcription",
        );
        transcript = await transcribeAudioChunked(file.buffer, file.filename, request.log);
      } catch (err) {
        request.log.error(err, "Whisper transcription failed");
        const message = err instanceof Error ? err.message : "Transcription failed";
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message,
        });
      }

      if (!transcript || transcript.trim().length === 0) {
        return reply.status(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Transcript is empty",
        });
      }

      let structured: { title: string; content: string; tags: string[] };
      try {
        structured = await structureTranscript(transcript, mode);
      } catch (err) {
        request.log.error(err, "Transcript structuring failed");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: getAiErrorMessage(err),
        });
      }

      // Phase 3.5 — note creation is the last step; wrapping it in
      // its own try/catch keeps the response shape consistent
      // (`{ statusCode, error, message }`) instead of falling through
      // to Fastify's default 500 handler. The user's audio is already
      // transcribed and structured by this point, so a DB failure
      // here feels like a backend problem to the client.
      let noteRow;
      try {
        noteRow = await createNote(userId, {
          title: structured.title,
          content: structured.content,
          tags: structured.tags,
          audioMode: mode,
          folderId,
        });
      } catch (err) {
        request.log.error(err, "Note creation failed after successful transcription + structuring");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: err instanceof Error ? err.message : "Failed to create note",
        });
      }

      const note = toNote(noteRow);

      return reply.send({
        title: structured.title,
        content: structured.content,
        tags: structured.tags,
        note,
      });
    },
  );

  // POST /ai/embeddings/enable
  fastify.post(
    "/embeddings/enable",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      await setEmbeddingEnabled(true);
      // Trigger background processing (fire-and-forget)
      processAllPendingEmbeddings().catch((error) => {
        _request.log.error(error, "Background embedding processing failed");
      });
      return reply.send({ enabled: true });
    },
  );

  // POST /ai/embeddings/disable
  fastify.post(
    "/embeddings/disable",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      await setEmbeddingEnabled(false);
      return reply.send({ enabled: false });
    },
  );

  // POST /ai/embeddings/generate
  const generateEmbeddingSchema = {
    body: {
      type: "object" as const,
      required: ["text", "inputType"],
      additionalProperties: false,
      properties: {
        text: { type: "string", minLength: 1, maxLength: 50000 },
        inputType: { type: "string", enum: ["document", "query"] },
      },
    },
  };

  fastify.post<{ Body: { text: string; inputType: "document" | "query" } }>(
    "/embeddings/generate",
    { schema: generateEmbeddingSchema },
    async (
      request: FastifyRequest<{ Body: { text: string; inputType: "document" | "query" } }>,
      reply: FastifyReply,
    ) => {
      const { text, inputType } = request.body;

      const embedding =
        inputType === "query"
          ? await generateQueryEmbedding(text)
          : await generateEmbedding(text);

      return reply.send({ embedding });
    },
  );

  // GET /ai/embeddings/status
  fastify.get(
    "/embeddings/status",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const prisma = getPrisma();
      const enabled = await isEmbeddingEnabled();

      const [pendingResult, embeddedResult] = await Promise.all([
        prisma.$queryRawUnsafe<[{ count: number }]>(
          `SELECT COUNT(*)::int AS count FROM "notes" WHERE "deletedAt" IS NULL AND ("embeddingUpdatedAt" IS NULL OR "embeddingUpdatedAt" < "updatedAt")`,
        ),
        prisma.$queryRawUnsafe<[{ count: number }]>(
          `SELECT COUNT(*)::int AS count FROM "notes" WHERE "deletedAt" IS NULL AND "embedding" IS NOT NULL`,
        ),
      ]);

      return reply.send({
        enabled,
        pendingCount: pendingResult[0]?.count ?? 0,
        totalWithEmbeddings: embeddedResult[0]?.count ?? 0,
      });
    },
  );

  // GET /ai/chat-history — fetch chat messages for the current user
  fastify.get(
    "/chat-history",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const messages = await getChatHistory(userId);
      return reply.send({ messages });
    },
  );

  // POST /ai/chat-history — append chat messages
  fastify.post<{
    Body: {
      messages: { role: string; content: string; sources?: unknown; meetingData?: unknown }[];
    };
  }>(
    "/chat-history",
    {
      schema: {
        body: {
          type: "object",
          required: ["messages"],
          additionalProperties: false,
          properties: {
            messages: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: {
                type: "object",
                required: ["role", "content"],
                additionalProperties: false,
                properties: {
                  role: { type: "string", enum: ["user", "assistant", "meeting-summary"] },
                  content: { type: "string" },
                  sources: {},
                  meetingData: {},
                  noteCards: {},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const created = await appendChatMessages(userId, request.body.messages);
      fastify.sseHub.notifyChat(userId);
      return reply.send({ messages: created });
    },
  );

  // DELETE /ai/chat-history — clear all chat messages
  fastify.delete(
    "/chat-history",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      await clearChatHistory(userId);
      fastify.sseHub.notifyChat(userId);
      return reply.send({ ok: true });
    },
  );
}
