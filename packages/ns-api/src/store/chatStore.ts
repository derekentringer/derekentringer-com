import { getPrisma } from "../lib/prisma.js";
import { randomUUID } from "node:crypto";

export interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  sources: unknown | null;
  meetingData: unknown | null;
  noteCards: unknown | null;
  /** Phase E follow-up: terminal-state confirmation cards (applied /
   *  discarded / failed) persist here so they survive a page refresh.
   *  Pending/applying cards are intentionally never written. */
  confirmation: unknown | null;
  createdAt: Date;
}

export async function getChatHistory(userId: string): Promise<ChatMessageRow[]> {
  const prisma = getPrisma();
  return prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      sources: true,
      meetingData: true,
      noteCards: true,
      confirmation: true,
      createdAt: true,
    },
  });
}

/** Coerce a client-supplied `createdAt` into a `Date` Prisma can
 *  accept. Returns `undefined` (so Prisma's default `now()` wins) for
 *  missing or unparseable input — the row still gets a sensible
 *  timestamp instead of bombing the whole save. */
function parseClientCreatedAt(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function appendChatMessages(
  userId: string,
  messages: { role: string; content: string; sources?: unknown; meetingData?: unknown; noteCards?: unknown; confirmation?: unknown; createdAt?: string }[],
): Promise<ChatMessageRow[]> {
  const prisma = getPrisma();
  const created: ChatMessageRow[] = [];

  for (const msg of messages) {
    const row = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        userId,
        role: msg.role,
        content: msg.content,
        sources: msg.sources ?? undefined,
        meetingData: msg.meetingData ?? undefined,
        noteCards: msg.noteCards ?? undefined,
        confirmation: msg.confirmation ?? undefined,
        createdAt: parseClientCreatedAt(msg.createdAt),
      },
      select: {
        id: true,
        role: true,
        content: true,
        sources: true,
        meetingData: true,
        noteCards: true,
        confirmation: true,
        createdAt: true,
      },
    });
    created.push(row);
  }

  return created;
}

export async function clearChatHistory(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.chatMessage.deleteMany({ where: { userId } });
}

/**
 * Atomic replace of the user's chat history. Clears all existing
 * messages and inserts the new ones inside a single transaction so a
 * mid-replace failure (e.g. the user refreshes the page between
 * DELETE and POST) can no longer leave the DB empty. Returns the
 * newly inserted rows.
 *
 * The frontend persistence pattern is "debounced snapshot replace"
 * — every save ships the full messages array, not a diff — so we
 * don't need a reconcile step; wipe + insert is the semantic.
 */
export async function replaceChatMessages(
  userId: string,
  messages: { role: string; content: string; sources?: unknown; meetingData?: unknown; noteCards?: unknown; confirmation?: unknown; createdAt?: string }[],
): Promise<ChatMessageRow[]> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany({ where: { userId } });
    const created: ChatMessageRow[] = [];
    for (const msg of messages) {
      const row = await tx.chatMessage.create({
        data: {
          id: randomUUID(),
          userId,
          role: msg.role,
          content: msg.content,
          sources: msg.sources ?? undefined,
          meetingData: msg.meetingData ?? undefined,
          noteCards: msg.noteCards ?? undefined,
          confirmation: msg.confirmation ?? undefined,
          // Honor the client's original timestamp on snapshot replace.
          // Prisma defaults to `now()`, which would otherwise stamp
          // every existing message as "Just now" on every save — a
          // particularly nasty bug because the authoring device's
          // in-memory state hides it; only devices hydrating fresh
          // from /chat-history (cross-device SSE refetch) saw the
          // breakage.
          createdAt: parseClientCreatedAt(msg.createdAt),
        },
        select: {
          id: true,
          role: true,
          content: true,
          sources: true,
          meetingData: true,
          noteCards: true,
          confirmation: true,
          createdAt: true,
        },
      });
      created.push(row);
    }
    return created;
  });
}
