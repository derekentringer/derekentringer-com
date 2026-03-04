import { getPrisma } from "../lib/prisma.js";
import { generateEmbedding } from "./embeddingService.js";
import { isEmbeddingEnabled } from "../store/settingStore.js";

const BATCH_SIZE = 1;
const INTERVAL_MS = 60_000; // 1 minute — stay well within 3 RPM free tier
const RATE_LIMIT_DELAY_MS = 22_000; // ~22s between calls for processAll (< 3 RPM)

interface PendingNote {
  id: string;
  title: string;
  content: string;
}

async function getPendingNotes(limit: number): Promise<PendingNote[]> {
  const prisma = getPrisma();
  return prisma.$queryRawUnsafe<PendingNote[]>(
    `SELECT "id", "title", "content" FROM "notes"
     WHERE "deletedAt" IS NULL
       AND ("embeddingUpdatedAt" IS NULL OR "embeddingUpdatedAt" < "updatedAt")
     ORDER BY "updatedAt" ASC
     LIMIT $1`,
    limit,
  );
}

async function updateNoteEmbedding(
  noteId: string,
  embedding: number[],
): Promise<void> {
  const prisma = getPrisma();
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$queryRawUnsafe(
    `UPDATE "notes" SET "embedding" = $1::vector, "embeddingUpdatedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $2`,
    vectorStr,
    noteId,
  );
}

async function markNoteEmbeddingCurrent(noteId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.$queryRawUnsafe(
    `UPDATE "notes" SET "embeddingUpdatedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $1`,
    noteId,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processAllPendingEmbeddings(): Promise<void> {
  let batch = await getPendingNotes(BATCH_SIZE);

  while (batch.length > 0) {
    for (const note of batch) {
      try {
        const text = `${note.title}\n${note.content}`.trim();
        if (text.length === 0 || !note.content.trim()) {
          await markNoteEmbeddingCurrent(note.id);
          continue;
        }
        const embedding = await generateEmbedding(text);
        await updateNoteEmbedding(note.id, embedding);
      } catch (error) {
        console.error(
          `Failed to generate embedding for note ${note.id}:`,
          error,
        );
      }
      // Rate-limit delay between notes to stay within 3 RPM
      await delay(RATE_LIMIT_DELAY_MS);
    }
    batch = await getPendingNotes(BATCH_SIZE);
  }
}

async function processBatch(): Promise<void> {
  const enabled = await isEmbeddingEnabled();
  if (!enabled) return;

  const notes = await getPendingNotes(BATCH_SIZE);

  for (const note of notes) {
    try {
      const text = `${note.title}\n${note.content}`;
      const embedding = await generateEmbedding(text);
      await updateNoteEmbedding(note.id, embedding);
    } catch (error) {
      console.error(
        `Failed to generate embedding for note ${note.id}:`,
        error,
      );
    }
  }
}

export function startEmbeddingProcessor(): { stop: () => void } {
  const timer = setInterval(() => {
    processBatch().catch((error) => {
      console.error("Embedding processor error:", error);
    });
  }, INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
  };
}
