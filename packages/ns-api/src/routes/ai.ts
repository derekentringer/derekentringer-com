import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateCompletion,
  generateSummary,
  suggestTags,
  rewriteText,
} from "../services/aiService.js";
import { getNote, updateNote } from "../store/noteStore.js";
import { listTags } from "../store/noteStore.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const completeSchema = {
  body: {
    type: "object" as const,
    required: ["context"],
    additionalProperties: false,
    properties: {
      context: { type: "string", minLength: 1 },
      style: { type: "string", enum: ["continue", "markdown", "brief"] },
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
            (style as "continue" | "markdown" | "brief") ?? "continue",
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
}
