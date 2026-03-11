import Database from "@tauri-apps/plugin-sql";
import { requestEmbedding } from "../api/ai.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIM_THRESHOLD = 0.3;
export const MIN_CONTENT_LEN = 20;
const RATE_LIMIT_MS = 22_000;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:notesync.db");
  }
  return dbInstance;
}

export async function getEmbedding(noteId: string): Promise<number[] | null> {
  const db = await getDb();
  const rows = await db.select<{ embedding: string }[]>(
    "SELECT embedding FROM note_embeddings WHERE note_id = $1",
    [noteId],
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].embedding);
  } catch {
    return null;
  }
}

export async function upsertEmbedding(
  noteId: string,
  embedding: number[],
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO note_embeddings (note_id, embedding, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(note_id) DO UPDATE SET embedding = $2, updated_at = $3`,
    [noteId, JSON.stringify(embedding), now],
  );
}

export async function deleteEmbedding(noteId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM note_embeddings WHERE note_id = $1", [noteId]);
}

export interface EmbeddingEntry {
  noteId: string;
  embedding: number[];
}

export async function getAllEmbeddings(): Promise<EmbeddingEntry[]> {
  const db = await getDb();
  const rows = await db.select<{ note_id: string; embedding: string }[]>(
    "SELECT note_id, embedding FROM note_embeddings",
  );
  return rows.map((r) => ({
    noteId: r.note_id,
    embedding: JSON.parse(r.embedding),
  }));
}

export interface EmbeddingStatus {
  isProcessing: boolean;
  pendingCount: number;
  totalWithEmbeddings: number;
}

export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const db = await getDb();
  const [pendingRow] = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM notes n
     LEFT JOIN note_embeddings ne ON n.id = ne.note_id
     WHERE n.is_deleted = 0 AND ne.note_id IS NULL AND LENGTH(n.content) >= $1`,
    [MIN_CONTENT_LEN],
  );
  const [embeddedRow] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM note_embeddings",
  );
  return {
    isProcessing: processingActive,
    pendingCount: pendingRow?.count ?? 0,
    totalWithEmbeddings: embeddedRow?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Cosine similarity (pure JS)
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// Background processor
// ---------------------------------------------------------------------------

let processingActive = false;
let abortController: AbortController | null = null;
let statusCb: ((status: EmbeddingStatus) => void) | null = null;

export function setEmbeddingStatusCallback(
  cb: ((status: EmbeddingStatus) => void) | null,
): void {
  statusCb = cb;
}

async function notifyStatus(): Promise<void> {
  if (!statusCb) return;
  const status = await getEmbeddingStatus();
  statusCb(status);
}

export async function processAllPendingEmbeddings(): Promise<void> {
  if (processingActive) return;
  processingActive = true;
  abortController = new AbortController();

  try {
    await notifyStatus();

    const db = await getDb();
    const pending = await db.select<{ id: string; title: string; content: string }[]>(
      `SELECT n.id, n.title, n.content FROM notes n
       LEFT JOIN note_embeddings ne ON n.id = ne.note_id
       WHERE n.is_deleted = 0 AND ne.note_id IS NULL AND LENGTH(n.content) >= $1
       ORDER BY n.updated_at DESC`,
      [MIN_CONTENT_LEN],
    );

    for (const note of pending) {
      if (abortController.signal.aborted) break;

      try {
        const text = `${note.title}\n\n${note.content}`.trim();
        const embedding = await requestEmbedding(text);
        await upsertEmbedding(note.id, embedding);
        await notifyStatus();
      } catch {
        // Fail silently (offline, rate limit, etc.)
      }

      // Rate limit between requests
      if (!abortController.signal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, RATE_LIMIT_MS);
          abortController!.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }
  } finally {
    processingActive = false;
    abortController = null;
    await notifyStatus();
  }
}

export function stopEmbeddingProcessor(): void {
  abortController?.abort();
}

// ---------------------------------------------------------------------------
// Single-note embedding (fire-and-forget)
// ---------------------------------------------------------------------------

export async function queueEmbeddingForNote(
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  if (content.length < MIN_CONTENT_LEN) return;
  try {
    const text = `${title}\n\n${content}`.trim();
    const embedding = await requestEmbedding(text);
    await upsertEmbedding(noteId, embedding);
    await notifyStatus();
  } catch {
    // Fail silently when offline
  }
}
