import { getDB, type OfflineQueueEntry } from "./db.ts";

export async function enqueue(
  entry: Omit<OfflineQueueEntry, "id">,
): Promise<number> {
  const db = await getDB();
  return db.add("offlineQueue", entry as OfflineQueueEntry);
}

export async function dequeue(): Promise<OfflineQueueEntry | undefined> {
  const db = await getDB();
  const tx = db.transaction("offlineQueue", "readwrite");
  const cursor = await tx.store.openCursor();
  if (!cursor) {
    await tx.done;
    return undefined;
  }
  const entry = { ...cursor.value };
  await cursor.delete();
  await tx.done;
  return entry;
}

export async function peekAll(): Promise<OfflineQueueEntry[]> {
  const db = await getDB();
  return db.getAll("offlineQueue");
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("offlineQueue");
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear("offlineQueue");
}

export async function removeEntriesForNote(noteId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("offlineQueue", "readwrite");
  const index = tx.store.index("by-noteId");
  let cursor = await index.openCursor(noteId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
