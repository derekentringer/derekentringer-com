import { v4 as uuidv4 } from "uuid";
import { apiFetch, getAccessToken, refreshAccessToken, tokenManager } from "../api/client.ts";
import {
  readSyncQueue,
  removeSyncQueueEntries,
  getSyncMeta,
  setSyncMeta,
  fetchNoteById,
  upsertNoteFromRemote,
  upsertFolderFromRemote,
  softDeleteNoteFromRemote,
  softDeleteFolderFromRemote,
  getNoteLocalPath,
  getNoteLocalFileHash,
} from "./db.ts";
import { computeContentHash, fileExists } from "./localFileService.ts";
import type {
  SyncChange,
  SyncRejection,
  SyncPushRequest,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushResponse,
  Note,
  FolderSyncData,
} from "@derekentringer/ns-shared";

const SSE_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

let semanticSearchEnabled = false;

export function setSyncSemanticSearchEnabled(enabled: boolean): void {
  semanticSearchEnabled = enabled;
}

const DEBOUNCE_MS = 5_000;
const PERIODIC_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
const BATCH_LIMIT = 100;
const DEVICE_ID_KEY = "deviceId";
const LAST_PULL_KEY = "lastPullAt";

let syncStatus: SyncStatus = "idle";
let syncError: string | null = null;
let syncInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let backoffMs = 1000;
let deviceId: string | null = null;
let statusCallback: ((status: SyncStatus, error: string | null) => void) | null = null;
let dataChangedCallback: (() => void) | null = null;
let localFileCloudUpdateCallback: ((noteId: string) => void) | null = null;
let sseAbortController: AbortController | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let sseBackoffMs = 1000;

function setStatus(status: SyncStatus, error: string | null = null) {
  syncStatus = status;
  syncError = error;
  statusCallback?.(status, error);
}

async function getOrCreateDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const stored = await getSyncMeta(DEVICE_ID_KEY);
  if (stored) {
    deviceId = stored;
    return stored;
  }
  const newId = uuidv4();
  await setSyncMeta(DEVICE_ID_KEY, newId);
  deviceId = newId;
  return newId;
}

export interface SyncEngineCallbacks {
  onStatusChange: (status: SyncStatus, error: string | null) => void;
  onDataChanged: () => void;
  onLocalFileCloudUpdate?: (noteId: string) => void;
  onNoteRemoteDeleted?: (noteId: string) => void;
  onSyncRejections?: (
    rejections: SyncRejection[],
    forcePush: (changeIds: string[]) => Promise<void>,
    discard: (changeIds: string[]) => Promise<void>,
  ) => void;
}

let noteRemoteDeletedCallback: ((noteId: string) => void) | null = null;
let syncRejectionsCallback: SyncEngineCallbacks["onSyncRejections"] | null = null;

export async function initSyncEngine(callbacks: SyncEngineCallbacks): Promise<void> {
  statusCallback = callbacks.onStatusChange;
  dataChangedCallback = callbacks.onDataChanged;
  localFileCloudUpdateCallback = callbacks.onLocalFileCloudUpdate ?? null;
  noteRemoteDeletedCallback = callbacks.onNoteRemoteDeleted ?? null;
  syncRejectionsCallback = callbacks.onSyncRejections ?? null;

  await getOrCreateDeviceId();

  // Check online state
  if (!navigator.onLine) {
    setStatus("offline");
  }

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Initial sync + SSE
  if (navigator.onLine) {
    triggerSync();
    connectSse();
  }

  // Periodic sync (fallback for silent SSE drops + pushing local queue)
  periodicTimer = setInterval(() => {
    if (navigator.onLine) {
      triggerSync();
    }
  }, PERIODIC_MS);
}

export function destroySyncEngine(): void {
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);

  disconnectSse();
  sseBackoffMs = 1000;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }

  statusCallback = null;
  dataChangedCallback = null;
  localFileCloudUpdateCallback = null;
  noteRemoteDeletedCallback = null;
  syncRejectionsCallback = null;
  syncInProgress = false;
  deviceId = null;
  backoffMs = 1000;
  setStatus("idle");
}

function disconnectSse() {
  sseAbortController?.abort();
  sseAbortController = null;
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (sseRefreshTimer) {
    clearTimeout(sseRefreshTimer);
    sseRefreshTimer = null;
  }
}

const MIN_SSE_RECONNECT_MS = 30_000;

function scheduleSseReconnect() {
  if (sseReconnectTimer) return;
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = null;
    if (navigator.onLine) connectSse();
  }, sseBackoffMs);
  sseBackoffMs = Math.min(sseBackoffMs * 2, 30_000);
}

/** Compute dynamic reconnect delay based on token expiry, with jitter */
function computeSseRefreshDelay(): number {
  const msUntilExpiry = tokenManager.getMsUntilExpiry();
  // Reconnect 2 minutes before expiry, minimum 30 seconds
  const baseMs = msUntilExpiry
    ? Math.max(msUntilExpiry - 120_000, MIN_SSE_RECONNECT_MS)
    : 13 * 60 * 1000;
  // Add 10% jitter to avoid thundering herd
  const jitter = Math.floor(Math.random() * baseMs * 0.1);
  return baseMs + jitter;
}

async function connectSse(): Promise<void> {
  // Disconnect any existing connection first
  disconnectSse();

  let token = getAccessToken();
  if (!token || !deviceId) {
    scheduleSseReconnect();
    return;
  }

  // Check if token is about to expire (within 60s) and refresh proactively
  const msUntilExpiry = tokenManager.getMsUntilExpiry();
  if (msUntilExpiry !== null && msUntilExpiry < 60_000) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
    } else {
      scheduleSseReconnect();
      return;
    }
  }

  sseAbortController = new AbortController();
  const localController = sseAbortController;

  try {
    const response = await fetch(
      `${SSE_BASE_URL}/sync/events?deviceId=${deviceId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: localController.signal,
        credentials: "include",
      },
    );

    if (!response.ok || !response.body) {
      // Distinguish auth errors from transient failures
      if (response.status === 403) {
        // Forbidden — stop retrying (permissions revoked)
        return;
      }
      if (response.status === 401) {
        // Try refresh and retry once
        const newToken = await refreshAccessToken();
        if (newToken) {
          sseBackoffMs = 1000;
          connectSse();
          return;
        }
        return;
      }
      scheduleSseReconnect();
      return;
    }

    // Reset backoff on successful connection
    sseBackoffMs = 1000;

    // Schedule proactive reconnect before JWT expiry (dynamic timer + jitter)
    sseRefreshTimer = setTimeout(() => {
      localController.abort();
      connectSse();
    }, computeSseRefreshDelay());

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          if (currentEvent === "sync") {
            triggerSync();
          }
          currentEvent = "";
        } else if (line === "") {
          currentEvent = "";
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return;
  }

  // Stream ended — only reconnect if this is still the current connection
  if (sseAbortController === localController) {
    scheduleSseReconnect();
  }
}

function handleOnline() {
  backoffMs = 1000;
  triggerSync();
  connectSse();
}

function handleOffline() {
  setStatus("offline");
  disconnectSse();
}

export function notifyLocalChange(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (navigator.onLine) {
      triggerSync();
    }
  }, DEBOUNCE_MS);
}

export function manualSync(): void {
  if (navigator.onLine) {
    triggerSync();
  }
}

export function getSyncStatus(): { status: SyncStatus; error: string | null } {
  return { status: syncStatus, error: syncError };
}

async function triggerSync(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;
  setStatus("syncing");

  try {
    const id = await getOrCreateDeviceId();
    await pushChanges(id);
    await pullChanges(id);
    backoffMs = 1000;
    setStatus("idle");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus("error", message);
    // Exponential backoff
    setTimeout(() => {
      if (navigator.onLine && syncStatus === "error") {
        triggerSync();
      }
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  } finally {
    syncInProgress = false;
  }
}

async function pushChanges(id: string): Promise<void> {
  const entries = await readSyncQueue(BATCH_LIMIT);
  if (entries.length === 0) return;

  // Deduplicate: keep latest entry per entity
  const deduped = new Map<string, typeof entries[0]>();
  for (const entry of entries) {
    const key = `${entry.entity_type}:${entry.entity_id}`;
    deduped.set(key, entry);
  }

  const changes: SyncChange[] = [];

  for (const entry of deduped.values()) {
    const [, action] = entry.action.split(":");
    const entityType = entry.entity_type as "note" | "folder";

    let data: Note | FolderSyncData | null = null;

    if (action !== "delete" && entityType === "note") {
      const note = await fetchNoteById(entry.entity_id);
      if (note) data = note;
    } else if (action !== "delete" && entityType === "folder") {
      // Read folder data from local DB for push
      data = await readLocalFolder(entry.entity_id);
    }

    changes.push({
      id: entry.entity_id,
      type: entityType,
      action: action as "create" | "update" | "delete",
      data,
      timestamp: entry.created_at,
    });
  }

  // Sort: folder creates/updates before notes (FK dependency), note deletes before folder deletes
  changes.sort((a, b) => {
    const order = (c: SyncChange) => {
      if (c.type === "folder" && c.action !== "delete") return 0;
      if (c.type === "note") return 1;
      if (c.type === "folder" && c.action === "delete") return 2;
      return 1;
    };
    return order(a) - order(b);
  });

  const payload: SyncPushRequest = { deviceId: id, changes };

  const response = await apiFetch("/sync/push", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Push failed: ${response.status}`);
  }

  const result: SyncPushResponse = await response.json();

  // If server returned rejection details, notify UI and only remove applied entries
  if (result.rejections && result.rejections.length > 0) {
    const rejectedIds = new Set(result.rejections.map((r) => r.changeId));

    // Remove only applied entries from queue (keep rejected ones)
    const appliedEntryIds = entries
      .filter((e) => !rejectedIds.has(e.entity_id))
      .map((e) => e.id);
    if (appliedEntryIds.length > 0) {
      await removeSyncQueueEntries(appliedEntryIds);
    }

    console.warn(`Sync push: ${result.applied} applied, ${result.rejected} rejected, ${result.skipped} skipped`);

    // Notify UI with rejection details + action closures
    syncRejectionsCallback?.(
      result.rejections,
      (changeIds: string[]) => forcePushChanges(id, changeIds),
      (changeIds: string[]) => discardChanges(id, changeIds),
    );

    // Set error status but don't throw (avoids backoff retry loop)
    setStatus("error", `Push had ${result.rejections.length} rejected change(s)`);
    return;
  }

  // If any were rejected without details (legacy), throw to retry
  if (result.rejected > 0) {
    console.warn(`Sync push: ${result.applied} applied, ${result.rejected} rejected, ${result.skipped} skipped — retrying`);
    throw new Error(`Push had ${result.rejected} rejected changes`);
  }

  // Remove all processed entries (not just deduped - remove all originals)
  await removeSyncQueueEntries(entries.map((e) => e.id));
}

export async function forcePushChanges(deviceIdOverride: string, changeIds: string[]): Promise<void> {
  const id = deviceIdOverride || (await getOrCreateDeviceId());
  const entries = await readSyncQueue(BATCH_LIMIT);
  const targetEntries = entries.filter((e) => changeIds.includes(e.entity_id));
  if (targetEntries.length === 0) return;

  // Deduplicate
  const deduped = new Map<string, typeof entries[0]>();
  for (const entry of targetEntries) {
    const key = `${entry.entity_type}:${entry.entity_id}`;
    deduped.set(key, entry);
  }

  const changes: SyncChange[] = [];
  for (const entry of deduped.values()) {
    const [, action] = entry.action.split(":");
    const entityType = entry.entity_type as "note" | "folder";

    let data: Note | FolderSyncData | null = null;
    if (action !== "delete" && entityType === "note") {
      const note = await fetchNoteById(entry.entity_id);
      if (note) data = note;
    } else if (action !== "delete" && entityType === "folder") {
      data = await readLocalFolder(entry.entity_id);
    }

    changes.push({
      id: entry.entity_id,
      type: entityType,
      action: action as "create" | "update" | "delete",
      data,
      timestamp: entry.created_at,
      force: true,
    });
  }

  const payload: SyncPushRequest = { deviceId: id, changes };
  const response = await apiFetch("/sync/push", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Force push failed: ${response.status}`);
  }

  const result: SyncPushResponse = await response.json();

  // Remove applied entries from queue
  const rejectedIds = new Set((result.rejections ?? []).map((r) => r.changeId));
  const appliedEntryIds = targetEntries
    .filter((e) => !rejectedIds.has(e.entity_id))
    .map((e) => e.id);
  if (appliedEntryIds.length > 0) {
    await removeSyncQueueEntries(appliedEntryIds);
  }

  if (result.applied > 0) {
    dataChangedCallback?.();
  }
}

export async function discardChanges(deviceIdOverride: string, changeIds: string[]): Promise<void> {
  const id = deviceIdOverride || (await getOrCreateDeviceId());
  const entries = await readSyncQueue(BATCH_LIMIT);
  const targetEntryIds = entries
    .filter((e) => changeIds.includes(e.entity_id))
    .map((e) => e.id);

  if (targetEntryIds.length > 0) {
    await removeSyncQueueEntries(targetEntryIds);
  }

  // Pull latest server state to overwrite local data
  await pullChanges(id);
}

async function pullChanges(id: string): Promise<void> {
  const lastPull = await getSyncMeta(LAST_PULL_KEY);
  const since = lastPull ?? new Date(0).toISOString();

  const payload: SyncPullRequest = { deviceId: id, since };

  const response = await apiFetch("/sync/pull", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Pull failed: ${response.status}`);
  }

  const result: SyncPullResponse = await response.json();
  let hadChanges = false;

  for (const change of result.changes) {
    if (change.type === "note") {
      await applyNoteChange(change);
      hadChanges = true;
    } else if (change.type === "folder") {
      await applyFolderChange(change);
      hadChanges = true;
    }
  }

  // Update cursor
  await setSyncMeta(LAST_PULL_KEY, result.cursor.lastSyncedAt);

  // Notify UI if data changed
  if (hadChanges) {
    dataChangedCallback?.();
  }

  // If server indicated more data, pull again
  if (result.hasMore) {
    await pullChanges(id);
  }
}

async function applyNoteChange(change: SyncChange): Promise<void> {
  if (change.action === "delete") {
    await softDeleteNoteFromRemote(change.id, change.timestamp);
    noteRemoteDeletedCallback?.(change.id);
    return;
  }

  const noteData = change.data as Note | null;
  if (!noteData) return;

  // Check if this is a local file note before upserting
  const localPath = await getNoteLocalPath(change.id);
  let localFileHash: string | null = null;
  if (localPath && localFileCloudUpdateCallback) {
    localFileHash = await getNoteLocalFileHash(change.id);
  }

  await upsertNoteFromRemote(noteData);

  // If the note has a local file link and content actually changed, notify UI
  // Skip if the local file is missing — don't override "missing" status with "cloud_newer"
  if (localPath && localFileCloudUpdateCallback && localFileHash) {
    const localExists = await fileExists(localPath);
    if (localExists) {
      const incomingHash = await computeContentHash(noteData.content);
      if (incomingHash !== localFileHash) {
        localFileCloudUpdateCallback(change.id);
      }
    }
  }

  // Queue embedding generation for synced notes
  if (semanticSearchEnabled && !noteData.deletedAt) {
    import("./embeddingService.ts")
      .then((m) => m.queueEmbeddingForNote(noteData.id, noteData.title, noteData.content))
      .catch(() => {});
  }
}

async function applyFolderChange(change: SyncChange): Promise<void> {
  if (change.action === "delete") {
    await softDeleteFolderFromRemote(change.id);
    return;
  }

  const folderData = change.data as FolderSyncData | null;
  if (!folderData) return;
  await upsertFolderFromRemote(folderData);
}

async function readLocalFolder(folderId: string): Promise<FolderSyncData | null> {
  // Import getDb dynamically to avoid circular deps at module level
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const { DB_URI } = await import("./dbName.ts");
  const db = await Database.load(DB_URI);
  const rows = await db.select<{
    id: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
    favorite: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }[]>(
    "SELECT * FROM folders WHERE id = $1",
    [folderId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
    favorite: r.favorite === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}
