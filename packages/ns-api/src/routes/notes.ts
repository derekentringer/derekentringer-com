import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  ReorderNotesRequest,
  ReorderFavoriteNotesRequest,
  ReorderFoldersRequest,
  TagListResponse,
} from "@derekentringer/shared/ns";
import { toNote, toNoteSearchResult, toNoteVersion } from "../lib/mappers.js";
import {
  createNote,
  getNote,
  listNotes,
  listTrashedNotes,
  updateNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
  permanentDeleteTrash,
  createFolder,
  listFolders,
  reorderNotes,
  reorderFavoriteNotes,
  renameFolder,
  deleteFolder,
  renameFolderById,
  deleteFolderById,
  moveFolder,
  CrossBoundaryMoveError,
  reorderFolders,
  getFolderPath,
  listTags,
  renameTag,
  removeTag,
  listFavoriteNotes,
  toggleFolderFavorite,
  getDashboardData,
} from "../store/noteStore.js";
import { getBacklinks, listNoteTitles } from "../store/linkStore.js";
import {
  getTrashRetentionDays,
  setTrashRetentionDays,
  getVersionIntervalMinutes,
  setVersionIntervalMinutes,
} from "../store/settingStore.js";
import {
  listVersions,
  getVersion,
} from "../store/versionStore.js";

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
      isLocalFile: { type: "boolean" },
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
      favorite: { type: "boolean" },
      isLocalFile: { type: "boolean" },
      transcript: { type: ["string", "null"] },
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

  // GET /notes/dashboard — MUST be before /:id
  fastify.get(
    "/dashboard",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const data = await getDashboardData(userId);
      return reply.send({
        recentlyEdited: data.recentlyEdited.map(toNote),
        favorites: data.favorites.map(toNote),
        audioNotes: data.audioNotes.map(toNote),
      });
    },
  );

  // GET /notes/titles — MUST be before /:id
  fastify.get(
    "/titles",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const notes = await listNoteTitles(userId);
      return reply.send({ notes });
    },
  );

  // GET /notes/favorites — MUST be before /:id
  fastify.get(
    "/favorites",
    async (
      request: FastifyRequest<{
        Querystring: { sortBy?: string; sortOrder?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { sortBy, sortOrder } = request.query;

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

      const notes = await listFavoriteNotes(
        userId,
        sortBy as NoteSortField | undefined,
        sortOrder as SortOrder | undefined,
      );
      return reply.send({ notes: notes.map(toNote) });
    },
  );

  // PUT /notes/favorites/reorder — MUST be before /:id
  fastify.put<{ Body: ReorderFavoriteNotesRequest }>(
    "/favorites/reorder",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["order"],
          additionalProperties: false,
          properties: {
            order: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "favoriteSortOrder"],
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  favoriteSortOrder: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: ReorderFavoriteNotesRequest }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      await reorderFavoriteNotes(userId, request.body.order);
      fastify.sseHub.notify(userId);
      return reply.status(204).send();
    },
  );

  // GET /notes/folders — MUST be before /:id
  fastify.get(
    "/folders",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const folders = await listFolders(userId);
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
      const userId = request.user.sub;
      try {
        const folder = await createFolder(
          userId,
          request.body.name,
          request.body.parentId,
        );
        fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      await reorderNotes(userId, request.body.order);
      fastify.sseHub.notify(userId);
      return reply.status(204).send();
    },
  );

  // GET /notes/tags — MUST be before /:id
  fastify.get(
    "/tags",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const tags = await listTags(userId);
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
      const userId = request.user.sub;
      const { name } = request.params;
      const { newName } = request.body;
      const updated = await renameTag(userId, name, newName);
      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      const { name } = request.params;
      const updated = await removeTag(userId, name);
      fastify.sseHub.notify(userId);
      return reply.send({ updated });
    },
  );

  // GET /notes/trash/retention — MUST be before /:id
  fastify.get(
    "/trash/retention",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const days = await getTrashRetentionDays();
      return reply.send({ days });
    },
  );

  // PUT /notes/trash/retention
  fastify.put<{ Body: { days: number } }>(
    "/trash/retention",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["days"],
          additionalProperties: false,
          properties: {
            days: { type: "integer", minimum: 0, maximum: 365 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { days: number } }>,
      reply: FastifyReply,
    ) => {
      const { days } = request.body;
      await setTrashRetentionDays(days);
      return reply.send({ days });
    },
  );

  // GET /notes/versions/interval — MUST be before /:id
  fastify.get(
    "/versions/interval",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const minutes = await getVersionIntervalMinutes();
      return reply.send({ minutes });
    },
  );

  // PUT /notes/versions/interval
  fastify.put<{ Body: { minutes: number } }>(
    "/versions/interval",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["minutes"],
          additionalProperties: false,
          properties: {
            minutes: { type: "integer", minimum: 0, maximum: 60 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { minutes: number } }>,
      reply: FastifyReply,
    ) => {
      const { minutes } = request.body;
      await setVersionIntervalMinutes(minutes);
      return reply.send({ minutes });
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
      const userId = request.user.sub;
      const { page, pageSize } = request.query;
      const result = await listTrashedNotes(userId, {
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

  // DELETE /notes/trash — bulk permanent delete (all or specific IDs)
  fastify.delete<{ Body?: { ids?: string[] } }>(
    "/trash",
    async (
      request: FastifyRequest<{ Body?: { ids?: string[] } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const ids = request.body?.ids;
      if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "ids must be an array of strings",
        });
      }
      const deleted = await permanentDeleteTrash(userId, ids);
      fastify.sseHub.notify(userId);
      return reply.send({ deleted });
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
      const userId = request.user.sub;
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

      const result = await listNotes(userId, {
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

  // GET /notes/:id/backlinks — MUST be before generic /:id
  fastify.get(
    "/:id/backlinks",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const backlinks = await getBacklinks(userId, id);
      return reply.send({ backlinks });
    },
  );

  // GET /notes/:id/versions — MUST be before generic /:id
  fastify.get(
    "/:id/versions",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { page?: string; pageSize?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const { page, pageSize } = request.query;
      const result = await listVersions(userId, id, {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });

      return reply.send({
        versions: result.versions.map(toNoteVersion),
        total: result.total,
      });
    },
  );

  // GET /notes/:id/versions/:versionId — MUST be before generic /:id
  fastify.get(
    "/:id/versions/:versionId",
    async (
      request: FastifyRequest<{
        Params: { id: string; versionId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id, versionId } = request.params;
      if (!UUID_REGEX.test(id) || !UUID_REGEX.test(versionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid ID format",
        });
      }

      const version = await getVersion(userId, versionId);
      if (!version || version.noteId !== id) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Version not found",
        });
      }

      return reply.send({ version: toNoteVersion(version) });
    },
  );

  // POST /notes/:id/versions/:versionId/restore — MUST be before generic /:id
  fastify.post(
    "/:id/versions/:versionId/restore",
    async (
      request: FastifyRequest<{
        Params: { id: string; versionId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id, versionId } = request.params;
      if (!UUID_REGEX.test(id) || !UUID_REGEX.test(versionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid ID format",
        });
      }

      const version = await getVersion(userId, versionId);
      if (!version || version.noteId !== id) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Version not found",
        });
      }

      const updated = await updateNote(userId, id, {
        title: version.title,
        content: version.content,
      });
      if (!updated) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      fastify.sseHub.notify(userId);
      return reply.send({ note: toNote(updated) });
    },
  );

  // GET /notes/:id
  fastify.get(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await getNote(userId, id);
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
      const userId = request.user.sub;
      const note = await createNote(userId, request.body);
      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      await reorderFolders(userId, request.body.order);
      fastify.sseHub.notify(userId);
      return reply.status(204).send();
    },
  );

  // PATCH /notes/folders/:id/favorite — toggle folder favorite
  fastify.patch<{
    Params: { id: string };
    Body: { favorite: boolean };
  }>(
    "/folders/:id/favorite",
    {
      schema: {
        body: {
          type: "object" as const,
          required: ["favorite"],
          additionalProperties: false,
          properties: {
            favorite: { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { favorite: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid folder ID format",
        });
      }

      try {
        const folder = await toggleFolderFavorite(userId, id, request.body.favorite);
        fastify.sseHub.notify(userId);
        return reply.send({ id: folder.id, favorite: folder.favorite });
      } catch (error) {
        if (isNotFoundError(error)) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Folder not found",
          });
        }
        throw error;
      }
    },
  );

  // PATCH /notes/folders/:id/move — move folder to new parent.
  //
  // Phase A.2: if the move crosses the managed/unmanaged boundary, the
  // store throws CrossBoundaryMoveError and we return 409 with a
  // structured body. Client shows a confirmation dialog and re-submits
  // with ?confirmCrossBoundary=1 to flip the subtree's isLocalFile in
  // one tx alongside the parent change.
  fastify.patch<{
    Params: { id: string };
    Querystring: { confirmCrossBoundary?: string };
    Body: { parentId: string | null; sortOrder?: number };
  }>(
    "/folders/:id/move",
    { schema: moveFolderSchema },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { confirmCrossBoundary?: string };
        Body: { parentId: string | null; sortOrder?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user.sub;
      const { id } = request.params;
      const confirm = request.query.confirmCrossBoundary === "1"
        || request.query.confirmCrossBoundary === "true";
      try {
        const folder = await moveFolder(
          userId,
          id,
          request.body.parentId,
          request.body.sortOrder,
          confirm,
        );
        fastify.sseHub.notify(userId);
        return reply.send({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          sortOrder: folder.sortOrder,
        });
      } catch (error) {
        if (error instanceof CrossBoundaryMoveError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            code: error.code,
            direction: error.direction,
            affectedFolderCount: error.affectedFolderCount,
            affectedNoteCount: error.affectedNoteCount,
            message: error.message,
          });
        }
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
      const userId = request.user.sub;
      const { id } = request.params;
      const { newName } = request.body;

      // If it looks like a UUID, rename by ID; otherwise legacy name-based rename
      if (UUID_REGEX.test(id)) {
        try {
          const folder = await renameFolderById(userId, id, newName);
          fastify.sseHub.notify(userId);
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
      const updated = await renameFolder(userId, id, newName);
      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
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
        const updated = await deleteFolderById(userId, id, mode ?? "move-up");
        fastify.sseHub.notify(userId);
        return reply.send({ updated });
      }

      // Legacy name-based delete
      const updated = await deleteFolder(userId, id);
      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const note = await restoreNote(userId, id);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
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
        body.summary === undefined &&
        body.favorite === undefined &&
        body.isLocalFile === undefined &&
        body.transcript === undefined
      ) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "At least one field is required",
        });
      }

      const note = await updateNote(userId, id, body);
      if (!note) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const deleted = await permanentDeleteNote(userId, id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      fastify.sseHub.notify(userId);
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
      const userId = request.user.sub;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid note ID format",
        });
      }

      const deleted = await softDeleteNote(userId, id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Note not found",
        });
      }

      fastify.sseHub.notify(userId);
      return reply.status(204).send();
    },
  );
}
