import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  ReorderNotesRequest,
  TagListResponse,
} from "@derekentringer/shared/ns";
import { toNote, toNoteSearchResult } from "../lib/mappers.js";
import {
  createNote,
  getNote,
  listNotes,
  listTrashedNotes,
  updateNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
  createFolder,
  listFolders,
  reorderNotes,
  renameFolder,
  deleteFolder,
  listTags,
  renameTag,
  removeTag,
} from "../store/noteStore.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_SORT_FIELDS: NoteSortField[] = ["title", "createdAt", "updatedAt", "sortOrder"];
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
      summary: { type: ["string", "null"] },
    },
  },
};

const reorderSchema = {
  body: {
    type: "object" as const,
    required: ["order"],
    additionalProperties: false,
    properties: {
      order: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "sortOrder"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            sortOrder: { type: "integer" },
          },
        },
      },
    },
  },
};

const createFolderSchema = {
  body: {
    type: "object" as const,
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
    },
  },
};

const renameFolderSchema = {
  body: {
    type: "object" as const,
    required: ["newName"],
    additionalProperties: false,
    properties: {
      newName: { type: "string", minLength: 1 },
    },
  },
};

const renameTagSchema = {
  body: {
    type: "object" as const,
    required: ["newName"],
    additionalProperties: false,
    properties: {
      newName: { type: "string", minLength: 1 },
    },
  },
};

export default async function noteRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /notes/folders — MUST be before /:id
  fastify.get(
    "/folders",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const folders = await listFolders();
      const response: FolderListResponse = { folders };
      return reply.send(response);
    },
  );

  // POST /notes/folders — create a standalone folder
  fastify.post<{ Body: { name: string } }>(
    "/folders",
    { schema: createFolderSchema },
    async (
      request: FastifyRequest<{ Body: { name: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        await createFolder(request.body.name);
        return reply.status(201).send({ name: request.body.name });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Folder already exists",
          });
        }
        throw error;
      }
    },
  );

  // PUT /notes/reorder — MUST be before /:id
  fastify.put<{ Body: ReorderNotesRequest }>(
    "/reorder",
    { schema: reorderSchema },
    async (
      request: FastifyRequest<{ Body: ReorderNotesRequest }>,
      reply: FastifyReply,
    ) => {
      await reorderNotes(request.body.order);
      return reply.status(204).send();
    },
  );

  // GET /notes/tags — MUST be before /:id
  fastify.get(
    "/tags",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const tags = await listTags();
      const response: TagListResponse = { tags };
      return reply.send(response);
    },
  );

  // PATCH /notes/tags/:name — rename a tag
  fastify.patch<{ Params: { name: string }; Body: { newName: string } }>(
    "/tags/:name",
    { schema: renameTagSchema },
    async (
      request: FastifyRequest<{
        Params: { name: string };
        Body: { newName: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.params;
      const { newName } = request.body;
      const updated = await renameTag(name, newName);
      return reply.send({ updated });
    },
  );

  // DELETE /notes/tags/:name — remove a tag from all notes
  fastify.delete(
    "/tags/:name",
    async (
      request: FastifyRequest<{ Params: { name: string } }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.params;
      const updated = await removeTag(name);
      return reply.send({ updated });
    },
  );

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
          tags?: string;
          page?: string;
          pageSize?: string;
          sortBy?: string;
          sortOrder?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { folder, search, tags, page, pageSize, sortBy, sortOrder } =
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

      const parsedTags = tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const result = await listNotes({
        folder,
        search,
        tags: parsedTags,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        sortBy: sortBy as NoteSortField | undefined,
        sortOrder: sortOrder as SortOrder | undefined,
      });

      // Use toNoteSearchResult when search is active (includes headline)
      if (search) {
        return reply.send({
          notes: result.notes.map(toNoteSearchResult),
          total: result.total,
        });
      }

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

  // PATCH /notes/folders/:name — rename a folder
  fastify.patch<{ Params: { name: string }; Body: { newName: string } }>(
    "/folders/:name",
    { schema: renameFolderSchema },
    async (
      request: FastifyRequest<{
        Params: { name: string };
        Body: { newName: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.params;
      const { newName } = request.body;
      const updated = await renameFolder(name, newName);
      return reply.send({ updated });
    },
  );

  // DELETE /notes/folders/:name — unfile all notes in folder
  fastify.delete(
    "/folders/:name",
    async (
      request: FastifyRequest<{ Params: { name: string } }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.params;
      const updated = await deleteFolder(name);
      return reply.send({ updated });
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
        body.tags === undefined &&
        body.summary === undefined
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
