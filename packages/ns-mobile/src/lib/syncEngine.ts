import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";
import { tokenManager, tokenStorage } from "@/services/api";
import {
  readSyncQueue,
  removeSyncQueueEntries,
  getSyncMeta,
  setSyncMeta,
  readNoteForSync,
  readFolderForSync,
  upsertNoteFromRemote,
  upsertFolderFromRemote,
  softDeleteNoteFromRemote,
  softDeleteFolderFromRemote,
} from "./noteStore";
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

// ─── Types ─────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

export interface SyncEngineCallbacks {
  onStatusChange: (status: SyncStatus, error: string | null) => void;
  onDataChanged: () => void;
  onSyncRejections?: (
    rejections: SyncRejection[],
    forcePush: (changeIds: string[]) => Promise<void>,
    discard: (changeIds: string[]) => Promise<void>,
  ) => void;
}

// ─── Constants ─────────────────────────────────────────────

const DEBOUNCE_MS = 5_000;
const PERIODIC_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
const BATCH_LIMIT = 100;
const DEVICE_ID_KEY = "deviceId";
const LAST_PULL_KEY = "lastPullAt";

// ─── Module state ──────────────────────────────────────────

let apiBaseUrl = "";
let getToken: () => Promise<string | null> = async () => null;

let syncStatus: SyncStatus = "idle";
let syncError: string | null = null;
let syncInProgress = false;
let isOnline = true;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let backoffMs = 1000;
let deviceId: string | null = null;

let statusCallback: SyncEngineCallbacks["onStatusChange"] | null = null;
let dataChangedCallback: SyncEngineCallbacks["onDataChanged"] | null = null;
let syncRejectionsCallback: SyncEngineCallbacks["onSyncRejections"] | null = null;

// SSE state
let sseXhr: XMLHttpRequest | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseBackoffMs = 1000;
let sseBuffer = "";

// Listeners
let netInfoUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;

// ─── Helpers ───────────────────────────────────────────────

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
  const newId = Crypto.randomUUID();
  await setSyncMeta(DEVICE_ID_KEY, newId);
  deviceId = newId;
  return newId;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Type": "mobile",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  // Handle 401 — try token refresh
  if (response.status === 401) {
    const newToken = await tokenManager.refreshAccessToken();
    if (newToken) {
      await tokenStorage.setTokens(newToken);
      headers.Authorization = `Bearer ${newToken}`;
      return fetch(`${apiBaseUrl}${path}`, { ...options, headers });
    }
  }

  return response;
}

// ─── Public API ────────────────────────────────────────────

export async function initSyncEngine(
  baseUrl: string,
  tokenGetter: () => Promise<string | null>,
  callbacks: SyncEngineCallbacks,
): Promise<void> {
  apiBaseUrl = baseUrl;
  getToken = tokenGetter;
  statusCallback = callbacks.onStatusChange;
  dataChangedCallback = callbacks.onDataChanged;
  syncRejectionsCallback = callbacks.onSyncRejections ?? null;

  await getOrCreateDeviceId();

  // Network listener
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const wasOnline = isOnline;
    isOnline = !!state.isConnected && !!state.isInternetReachable;

    if (!isOnline) {
      setStatus("offline");
      disconnectSse();
    } else if (!wasOnline && isOnline) {
      // Back online
      backoffMs = 1000;
      triggerSync();
      connectSse();
    }
  });

  // App state listener — disconnect SSE in background, reconnect in foreground
  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

  // Check initial connectivity
  const netState = await NetInfo.fetch();
  isOnline = !!netState.isConnected && !!netState.isInternetReachable;

  if (!isOnline) {
    setStatus("offline");
  } else {
    triggerSync();
    connectSse();
  }

  // Periodic sync fallback
  periodicTimer = setInterval(() => {
    if (isOnline) {
      triggerSync();
    }
  }, PERIODIC_MS);
}

export function destroySyncEngine(): void {
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
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  statusCallback = null;
  dataChangedCallback = null;
  syncRejectionsCallback = null;
  syncInProgress = false;
  deviceId = null;
  backoffMs = 1000;
  setStatus("idle");
}

export function notifyLocalChange(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (isOnline) {
      triggerSync();
    }
  }, DEBOUNCE_MS);
}

export function manualSync(): void {
  if (isOnline) {
    triggerSync();
  }
}

export function getSyncEngineStatus(): { status: SyncStatus; error: string | null } {
  return { status: syncStatus, error: syncError };
}

// ─── App state handling ────────────────────────────────────

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === "active") {
    if (isOnline) {
      triggerSync();
      connectSse();
    }
  } else if (nextState === "background" || nextState === "inactive") {
    disconnectSse();
  }
}

// ─── SSE (XMLHttpRequest streaming) ────────────────────────

function disconnectSse() {
  if (sseXhr) {
    sseXhr.abort();
    sseXhr = null;
  }
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  sseBuffer = "";
}

function scheduleSseReconnect() {
  if (sseReconnectTimer) return;
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = null;
    if (isOnline) connectSse();
  }, sseBackoffMs);
  sseBackoffMs = Math.min(sseBackoffMs * 2, 30_000);
}

async function connectSse(): Promise<void> {
  disconnectSse();

  const token = await getToken();
  if (!token || !deviceId) {
    scheduleSseReconnect();
    return;
  }

  const xhr = new XMLHttpRequest();
  sseXhr = xhr;
  sseBuffer = "";

  let lastProcessedLength = 0;

  xhr.open("GET", `${apiBaseUrl}/sync/events?deviceId=${deviceId}`);
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  xhr.setRequestHeader("Accept", "text/event-stream");
  xhr.setRequestHeader("X-Client-Type", "mobile");

  xhr.onreadystatechange = () => {
    if (xhr.readyState >= 3 && xhr.status === 200) {
      // Reset backoff on successful connection
      sseBackoffMs = 1000;

      const newData = xhr.responseText.substring(lastProcessedLength);
      lastProcessedLength = xhr.responseText.length;

      sseBuffer += newData;
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

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
  };

  xhr.onerror = () => {
    if (sseXhr === xhr) {
      scheduleSseReconnect();
    }
  };

  xhr.onloadend = () => {
    if (sseXhr === xhr) {
      sseXhr = null;
      // Handle auth failure
      if (xhr.status === 401) {
        tokenManager.refreshAccessToken().then((newToken) => {
          if (newToken) {
            sseBackoffMs = 1000;
            connectSse();
          }
        });
        return;
      }
      scheduleSseReconnect();
    }
  };

  xhr.send();
}

// ─── Core sync flow ────────────────────────────────────────

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
    // Exponential backoff retry
    setTimeout(() => {
      if (isOnline && syncStatus === "error") {
        triggerSync();
      }
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  } finally {
    syncInProgress = false;
  }
}

// ─── Push ──────────────────────────────────────────────────

async function pushChanges(id: string): Promise<void> {
  const entries = await readSyncQueue(BATCH_LIMIT);
  if (entries.length === 0) return;

  // Deduplicate: keep latest entry per entity
  const deduped = new Map<string, (typeof entries)[0]>();
  for (const entry of entries) {
    const key = `${entry.entity_type}:${entry.entity_id}`;
    deduped.set(key, entry);
  }

  const changes: SyncChange[] = [];

  for (const entry of deduped.values()) {
    const action = entry.action as "create" | "update" | "delete";
    const entityType = entry.entity_type as "note" | "folder";

    let data: Note | FolderSyncData | null = null;

    if (action !== "delete" && entityType === "note") {
      data = await readNoteForSync(entry.entity_id);
    } else if (action !== "delete" && entityType === "folder") {
      data = await readFolderForSync(entry.entity_id);
    }

    changes.push({
      id: entry.entity_id,
      type: entityType,
      action,
      data,
      timestamp: entry.created_at,
    });
  }

  // Sort: folder creates/updates → notes → folder deletes (FK ordering)
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

  // Handle rejections with detail
  if (result.rejections && result.rejections.length > 0) {
    const rejectedIds = new Set(result.rejections.map((r) => r.changeId));

    // Remove only applied entries
    const appliedEntryIds = entries
      .filter((e) => !rejectedIds.has(e.entity_id))
      .map((e) => e.id);
    if (appliedEntryIds.length > 0) {
      await removeSyncQueueEntries(appliedEntryIds);
    }

    // Notify UI
    syncRejectionsCallback?.(
      result.rejections,
      (changeIds: string[]) => forcePushChanges(id, changeIds),
      (changeIds: string[]) => discardChanges(id, changeIds),
    );

    setStatus("error", `Push had ${result.rejections.length} rejected change(s)`);
    return;
  }

  // Legacy rejected without detail — throw to retry
  if (result.rejected > 0) {
    throw new Error(`Push had ${result.rejected} rejected changes`);
  }

  // Remove all processed entries
  await removeSyncQueueEntries(entries.map((e) => e.id));
}

// ─── Force push / discard ──────────────────────────────────

export async function forcePushChanges(deviceIdOverride: string, changeIds: string[]): Promise<void> {
  const id = deviceIdOverride || (await getOrCreateDeviceId());
  const entries = await readSyncQueue(BATCH_LIMIT);
  const targetEntries = entries.filter((e) => changeIds.includes(e.entity_id));
  if (targetEntries.length === 0) return;

  const deduped = new Map<string, (typeof entries)[0]>();
  for (const entry of targetEntries) {
    const key = `${entry.entity_type}:${entry.entity_id}`;
    deduped.set(key, entry);
  }

  const changes: SyncChange[] = [];
  for (const entry of deduped.values()) {
    const action = entry.action as "create" | "update" | "delete";
    const entityType = entry.entity_type as "note" | "folder";

    let data: Note | FolderSyncData | null = null;
    if (action !== "delete" && entityType === "note") {
      data = await readNoteForSync(entry.entity_id);
    } else if (action !== "delete" && entityType === "folder") {
      data = await readFolderForSync(entry.entity_id);
    }

    changes.push({
      id: entry.entity_id,
      type: entityType,
      action,
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

  // Pull latest server state
  await pullChanges(id);
}

// ─── Pull ──────────────────────────────────────────────────

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

  // Notify UI
  if (hadChanges) {
    dataChangedCallback?.();
  }

  // If more data available, pull again
  if (result.hasMore) {
    await pullChanges(id);
  }
}

async function applyNoteChange(change: SyncChange): Promise<void> {
  if (change.action === "delete") {
    await softDeleteNoteFromRemote(change.id, change.timestamp);
    return;
  }

  const noteData = change.data as Note | null;
  if (!noteData) return;
  await upsertNoteFromRemote(noteData);
}

async function applyFolderChange(change: SyncChange): Promise<void> {
  if (change.action === "delete") {
    await softDeleteFolderFromRemote(change.id, change.timestamp);
    return;
  }

  const folderData = change.data as FolderSyncData | null;
  if (!folderData) return;
  await upsertFolderFromRemote(folderData);
}
