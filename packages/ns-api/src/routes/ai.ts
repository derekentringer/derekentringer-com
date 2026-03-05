import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateCompletion,
  generateSummary,
  suggestTags,
  rewriteText,
  structureTranscript,
  answerQuestion,
} from "../services/aiService.js";
import { transcribeAudio } from "../services/whisperService.js";
import { getNote, updateNote, createNote, findRelevantNotes } from "../store/noteStore.js";
import { listTags } from "../store/noteStore.js";
import { toNote } from "../lib/mappers.js";
import type { AudioMode } from "@derekentringer/shared/ns";
import {
  isEmbeddingEnabled,
  setEmbeddingEnabled,
} from "../store/settingStore.js";
import { processAllPendingEmbeddings } from "../services/embeddingProcessor.js";
import { getPrisma } from "../lib/prisma.js";

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

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

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
  fastify.post<{ Body: { question: string } }>(
    "/ask",
    { schema: askSchema },
    async (
      request: FastifyRequest<{ Body: { question: string } }>,
      reply: FastifyReply,
    ) => {
      const { question } = request.body;

      const abortController = new AbortController();
      const passthrough = new PassThrough();

      request.raw.socket.on("close", () => {
        abortController.abort();
      });

      (async () => {
        try {
          const relevantNotes = await findRelevantNotes(question, 5);

          const sources = relevantNotes.map((n) => ({
            id: n.id,
            title: n.title,
          }));
          passthrough.write(
            `data: ${JSON.stringify({ sources })}\n\n`,
          );

          if (relevantNotes.length === 0) {
            passthrough.write(
              `data: ${JSON.stringify({ text: "I couldn't find any relevant notes to answer your question. Try adding more notes or rephrasing your question." })}\n\n`,
            );
          } else {
            for await (const chunk of answerQuestion(
              question,
              relevantNotes,
              abortController.signal,
            )) {
              if (abortController.signal.aborted) break;
              passthrough.write(
                `data: ${JSON.stringify({ text: chunk })}\n\n`,
              );
            }
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            request.log.error(error, "AI ask error");
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
      const { noteId } = request.body;

      if (!UUID_REGEX.test(noteId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(noteId);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      const summary = await generateSummary(note.title, note.content);

      await updateNote(noteId, { summary });

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
      const { noteId } = request.body;

      if (!UUID_REGEX.test(noteId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(noteId);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      const existingTags = await listTags();
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

  // POST /ai/transcribe — multipart/form-data
  fastify.post(
    "/transcribe",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let file;
      let mode: AudioMode = "memo";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "mode") {
            const val = (part.value as string) || "memo";
            if (VALID_MODES.includes(val as AudioMode)) {
              mode = val as AudioMode;
            }
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

      const transcript = await transcribeAudio(file.buffer, file.filename);

      if (!transcript || transcript.trim().length === 0) {
        return reply.status(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Transcript is empty",
        });
      }

      const structured = await structureTranscript(transcript, mode);

      const noteRow = await createNote({
        title: structured.title,
        content: structured.content,
        tags: structured.tags,
      });

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
}
