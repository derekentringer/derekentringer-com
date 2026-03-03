import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
} from "@derekentringer/shared/ns";
import { toNote } from "../lib/mappers.js";
import {
  createNote,
  getNote,
  listNotes,
  listTrashedNotes,
  updateNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
} from "../store/noteStore.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_SORT_FIELDS: NoteSortField[] = ["title", "createdAt", "updatedAt"];
const VALID_SORT_ORDERS: SortOrder[] = ["asc", "desc"];

const createNoteSchema = {
  body: {
    type: "object" as const,
    required: ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 },
      content: { type: "string" },
      folder: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
  },
};

const updateNoteSchema = {
  body: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 },
      content: { type: "string" },
      folder: { type: ["string", "null"] },
      tags: { type: "array", items: { type: "string" } },
    },
  },
};

export default async function noteRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /notes/trash — MUST be before /:id
  fastify.get(
    "/trash",
    async (
      request: FastifyRequest<{
        Querystring: { page?: string; pageSize?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { page, pageSize } = request.query;
      const result = await listTrashedNotes({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });

      const response: NoteListResponse = {
        notes: result.notes.map(toNote),
        total: result.total,
      };
      return reply.send(response);
    },
  );

  // GET /notes
  fastify.get(
    "/",
    async (
      request: FastifyRequest<{
        Querystring: {
          folder?: string;
          search?: string;
          page?: string;
          pageSize?: string;
          sortBy?: string;
          sortOrder?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { folder, search, page, pageSize, sortBy, sortOrder } =
        request.query;

      if (sortBy && !VALID_SORT_FIELDS.includes(sortBy as NoteSortField)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Invalid sortBy value. Must be one of: ${VALID_SORT_FIELDS.join(", ")}`,
        });
      }

      if (sortOrder && !VALID_SORT_ORDERS.includes(sortOrder as SortOrder)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Invalid sortOrder value. Must be one of: ${VALID_SORT_ORDERS.join(", ")}`,
        });
      }

      const result = await listNotes({
        folder,
        search,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        sortBy: sortBy as NoteSortField | undefined,
        sortOrder: sortOrder as SortOrder | undefined,
      });

      const response: NoteListResponse = {
        notes: result.notes.map(toNote),
        total: result.total,
      };
      return reply.send(response);
    },
  );

  // GET /notes/:id
  fastify.get(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(id);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      return reply.send({ note: toNote(note) });
    },
  );

  // POST /notes
  fastify.post<{ Body: CreateNoteRequest }>(
    "/",
    { schema: createNoteSchema },
    async (
      request: FastifyRequest<{ Body: CreateNoteRequest }>,
      reply: FastifyReply,
    ) => {
      const note = await createNote(request.body);
      return reply.status(201).send({ note: toNote(note) });
    },
  );

  // PATCH /notes/:id/restore — MUST be before generic PATCH /:id
  fastify.patch(
    "/:id/restore",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await restoreNote(id);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      return reply.send({ note: toNote(note) });
    },
  );

  // PATCH /notes/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateNoteRequest }>(
    "/:id",
    { schema: updateNoteSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateNoteRequest }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const body = request.body;
      if (
        body.title === undefined &&
        body.content === undefined &&
        body.folder === undefined &&
        body.tags === undefined
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "At least one field is required",
        });
      }

      const note = await updateNote(id, body);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      return reply.send({ note: toNote(note) });
    },
  );

  // DELETE /notes/:id/permanent — MUST be before generic DELETE /:id
  fastify.delete(
    "/:id/permanent",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const deleted = await permanentDeleteNote(id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      return reply.status(204).send();
    },
  );

  // DELETE /notes/:id
  fastify.delete(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const deleted = await softDeleteNote(id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      return reply.status(204).send();
    },
  );
}
