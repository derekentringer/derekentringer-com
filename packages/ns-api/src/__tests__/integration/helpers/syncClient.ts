import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  SyncChange,
  SyncPushRequest,
  SyncPushResponse,
  SyncPullRequest,
  SyncPullResponse,
  Note,
  FolderSyncData,
  ImageSyncData,
} from "@derekentringer/shared/ns";
import type { User } from "../../../generated/prisma/client.js";
import { createTestUser, authHeaderFor } from "./users.js";

/**
 * In-process wrapper around one synthetic sync client: a user + a deviceId
 * + convenience methods that drive /sync/push and /sync/pull through
 * app.inject. Keeps integration tests readable by letting them say
 *   await deviceA.push([...]); await deviceB.pull();
 * instead of hand-rolling payloads and auth on every call.
 *
 * Intentionally thin — the real client sync engines handle queuing,
 * dedup, retry, and rejection flows. Integration tests construct the
 * exact wire payload they want to exercise and read the response.
 */
export interface SyncClient {
  user: User;
  deviceId: string;
  authHeader: { Authorization: string };
  push(changes: SyncChange[]): Promise<SyncPushResponse>;
  pull(since?: string | Date): Promise<SyncPullResponse>;
}

// Tests that need raw app.inject (e.g. SSE streams) can use the underlying
// `app` and spread `client.authHeader` into the request headers directly —
// keeping SyncClient itself minimal.

export interface CreateSyncClientOptions {
  /** Reuse an existing user (for two-device scenarios on the same user). */
  user?: User;
  deviceId?: string;
}

export async function createSyncClient(
  app: FastifyInstance,
  opts: CreateSyncClientOptions = {},
): Promise<SyncClient> {
  const user = opts.user ?? (await createTestUser());
  const deviceId = opts.deviceId ?? randomUUID();
  const authHeader = authHeaderFor(user);

  return {
    user,
    deviceId,
    authHeader,

    async push(changes: SyncChange[]): Promise<SyncPushResponse> {
      const body: SyncPushRequest = { deviceId, changes };
      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: { ...authHeader, "content-type": "application/json" },
        payload: body,
      });
      if (res.statusCode !== 200) {
        throw new Error(
          `push failed ${res.statusCode}: ${res.body}`,
        );
      }
      return res.json() as SyncPushResponse;
    },

    async pull(since: string | Date = new Date(0)): Promise<SyncPullResponse> {
      const sinceIso = since instanceof Date ? since.toISOString() : since;
      const body: SyncPullRequest = { deviceId, since: sinceIso };
      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        headers: { ...authHeader, "content-type": "application/json" },
        payload: body,
      });
      if (res.statusCode !== 200) {
        throw new Error(
          `pull failed ${res.statusCode}: ${res.body}`,
        );
      }
      return res.json() as SyncPullResponse;
    },
  };
}

/**
 * Two-device setup for the same user. Typical pattern for asserting
 * sync convergence and LWW behavior.
 */
export async function createTwoDeviceSetup(
  app: FastifyInstance,
): Promise<{ user: User; a: SyncClient; b: SyncClient }> {
  const user = await createTestUser();
  const a = await createSyncClient(app, { user });
  const b = await createSyncClient(app, { user });
  return { user, a, b };
}

// ---- Change constructors ----
//
// Thin helpers for building SyncChange payloads. Tests that want exotic
// shapes bypass these and construct the wire type directly.

type NoteChangeInput =
  | { action: "create"; id?: string; data: Partial<Note>; timestamp?: string; force?: boolean }
  | { action: "update"; id: string; data: Partial<Note>; timestamp?: string; force?: boolean }
  | { action: "delete"; id: string; timestamp?: string; force?: boolean; data?: null };

export function noteChange(input: NoteChangeInput): SyncChange {
  const now = new Date().toISOString();

  if (input.action === "delete") {
    return {
      id: input.id,
      type: "note",
      action: "delete",
      data: null,
      timestamp: input.timestamp ?? now,
      ...(input.force ? { force: true } : {}),
    };
  }

  const id = input.action === "create" ? input.id ?? randomUUID() : input.id;
  const data: Note = {
    id,
    title: "",
    content: "",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: now,
    updatedAt: input.timestamp ?? now,
    deletedAt: null,
    ...input.data,
  };

  return {
    id,
    type: "note",
    action: input.action,
    data,
    timestamp: input.timestamp ?? now,
    ...(input.force ? { force: true } : {}),
  };
}

type FolderChangeInput =
  | { action: "create"; id?: string; data: Partial<FolderSyncData>; timestamp?: string; force?: boolean }
  | { action: "update"; id: string; data: Partial<FolderSyncData>; timestamp?: string; force?: boolean }
  | { action: "delete"; id: string; timestamp?: string; force?: boolean; data?: Partial<FolderSyncData> | null };

export function folderChange(input: FolderChangeInput): SyncChange {
  const now = new Date().toISOString();

  if (input.action === "delete") {
    return {
      id: input.id,
      type: "folder",
      action: "delete",
      // Server applyFolderChange delete branch ignores `data` (uses the
      // DB row it looks up), so we can widen to any shape here.
      data: (input.data as FolderSyncData | null | undefined) ?? null,
      timestamp: input.timestamp ?? now,
      ...(input.force ? { force: true } : {}),
    };
  }

  const id = input.action === "create" ? input.id ?? randomUUID() : input.id;
  const data: FolderSyncData = {
    id,
    name: "",
    parentId: null,
    sortOrder: 0,
    favorite: false,
    createdAt: now,
    updatedAt: input.timestamp ?? now,
    deletedAt: null,
    ...input.data,
  };

  return {
    id,
    type: "folder",
    action: input.action,
    data,
    timestamp: input.timestamp ?? now,
    ...(input.force ? { force: true } : {}),
  };
}

type ImageChangeInput =
  | { action: "create"; id?: string; data: Partial<ImageSyncData> & { noteId: string }; timestamp?: string; force?: boolean }
  | { action: "update"; id: string; data: Partial<ImageSyncData>; timestamp?: string; force?: boolean }
  | { action: "delete"; id: string; timestamp?: string; force?: boolean };

export function imageChange(input: ImageChangeInput): SyncChange {
  const now = new Date().toISOString();

  if (input.action === "delete") {
    return {
      id: input.id,
      type: "image",
      action: "delete",
      data: null,
      timestamp: input.timestamp ?? now,
      ...(input.force ? { force: true } : {}),
    };
  }

  const id = input.action === "create" ? input.id ?? randomUUID() : input.id;
  const data: ImageSyncData = {
    id,
    noteId: "" as string,
    filename: "test.png",
    mimeType: "image/png",
    sizeBytes: 0,
    r2Key: `${id}.png`,
    r2Url: `https://example.test/${id}.png`,
    altText: "",
    aiDescription: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: input.timestamp ?? now,
    deletedAt: null,
    ...(input.data as Partial<ImageSyncData>),
  };

  return {
    id,
    type: "image",
    action: input.action,
    data,
    timestamp: input.timestamp ?? now,
    ...(input.force ? { force: true } : {}),
  };
}
