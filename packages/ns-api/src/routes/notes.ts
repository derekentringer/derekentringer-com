import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  ReorderNotesRequest,
  ReorderFoldersRequest,
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
  renameFolderById,
  deleteFolderById,
  moveFolder,
  reorderFolders,
  getFolderPath,
  listTags,
  renameTag,
  removeTag,
} from "../store/noteStore.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2025"
  );
}

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
      folderId: { type: "string" },
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
      folderId: { type: ["string", "null"] },
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
      parentId: { type: "string" },
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

const moveFolderSchema = {
  body: {
    type: "object" as const,
    required: ["parentId"],
    additionalProperties: false,
    properties: {
      parentId: { type: ["string", "null"] },
      sortOrder: { type: "integer" },
    },
  },
};

const reorderFoldersSchema = {
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

  // POST /notes/folders — create a folder (optionally nested)
  fastify.post<{ Body: { name: string; parentId?: string } }>(
    "/folders",
    { schema: createFolderSchema },
    async (
      request: FastifyRequest<{ Body: { name: string; parentId?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const folder = await createFolder(
          request.body.name,
          request.body.parentId,
        );
        return reply.status(201).send({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          sortOrder: folder.sortOrder,
        });
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
          folderId?: string;
          search?: string;
          searchMode?: string;
          tags?: string;
          page?: string;
          pageSize?: string;
          sortBy?: string;
          sortOrder?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { folder, folderId, search, searchMode, tags, page, pageSize, sortBy, sortOrder } =
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

      const VALID_SEARCH_MODES = ["keyword", "semantic", "hybrid"];
      if (searchMode && !VALID_SEARCH_MODES.includes(searchMode)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Invalid searchMode value. Must be one of: ${VALID_SEARCH_MODES.join(", ")}`,
        });
      }

      const parsedTags = tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const result = await listNotes({
        folder,
        folderId,
        search,
        searchMode: searchMode as "keyword" | "semantic" | "hybrid" | undefined,
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

  // PUT /notes/folders/reorder — reorder sibling folders
  fastify.put<{ Body: ReorderFoldersRequest }>(
    "/folders/reorder",
    { schema: reorderFoldersSchema },
    async (
      request: FastifyRequest<{ Body: ReorderFoldersRequest }>,
      reply: FastifyReply,
    ) => {
      await reorderFolders(request.body.order);
      return reply.status(204).send();
    },
  );

  // PATCH /notes/folders/:id/move — move folder to new parent
  fastify.patch<{
    Params: { id: string };
    Body: { parentId: string | null; sortOrder?: number };
  }>(
    "/folders/:id/move",
    { schema: moveFolderSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { parentId: string | null; sortOrder?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      try {
        const folder = await moveFolder(id, request.body.parentId, request.body.sortOrder);
        return reply.send({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          sortOrder: folder.sortOrder,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Cannot move folder")) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  // PATCH /notes/folders/:id — rename a folder by ID (or name for backward compat)
  fastify.patch<{ Params: { id: string }; Body: { newName: string } }>(
    "/folders/:id",
    { schema: renameFolderSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { newName: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { newName } = request.body;

      // If it looks like a UUID, rename by ID; otherwise legacy name-based rename
      if (UUID_REGEX.test(id)) {
        try {
          const folder = await renameFolderById(id, newName);
          return reply.send({ id: folder.id, name: folder.name });
        } catch (error) {
          if (isNotFoundError(error)) {
            return reply.status(404).send({
              statusCode: 404,
              error: "Not Found",
              message: "Folder not found",
            });
          }
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code: string }).code === "P2002"
          ) {
            return reply.status(409).send({
              statusCode: 409,
              error: "Conflict",
              message: "Folder name already exists at this level",
            });
          }
          throw error;
        }
      }

      // Legacy name-based rename
      const updated = await renameFolder(id, newName);
      return reply.send({ updated });
    },
  );

  // DELETE /notes/folders/:id — delete folder by ID (or name for backward compat)
  fastify.delete<{ Params: { id: string }; Querystring: { mode?: string } }>(
    "/folders/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { mode?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const mode = request.query.mode as "move-up" | "recursive" | undefined;

      // If it looks like a UUID, delete by ID; otherwise legacy name-based delete
      if (UUID_REGEX.test(id)) {
        const validModes = ["move-up", "recursive"];
        if (mode && !validModes.includes(mode)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Invalid mode. Must be 'move-up' or 'recursive'",
          });
        }
        const updated = await deleteFolderById(id, mode ?? "move-up");
        return reply.send({ updated });
      }

      // Legacy name-based delete
      const updated = await deleteFolder(id);
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
        body.folderId === undefined &&
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
