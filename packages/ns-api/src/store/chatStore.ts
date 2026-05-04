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

/** How long a "processing" meeting-summary card may live in chat
 *  history without a matching transcription_jobs row before
 *  reconciliation declares it orphaned. Phase H Whisper jobs that
 *  cleanly reach the server typically resolve well under this; the
 *  window only matters for cards that lost their upload (cancel mid-
 *  upload, tab close before XHR completion, persist debounce racing
 *  the cancel signal). */
const ORPHAN_RECONCILE_GRACE_MS = 2 * 60 * 1000; // 2 minutes

interface MeetingCardData {
  sessionId?: string;
  status?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * Reconcile orphan meeting-summary cards: any row stuck in
 * `processing` whose sessionId has no matching `transcription_jobs`
 * entry for this user — and that's older than the grace window — is
 * rewritten to `failed` with a stable error message. Self-heals chat
 * history on every fetch instead of leaving orphan cards "Generating
 * note…" forever after a cancel race or interrupted upload.
 *
 * Cheap on the happy path (most users have zero orphans, so the inner
 * loop never runs) and idempotent (a reconciled card is no longer in
 * `processing`, so subsequent fetches skip it).
 *
 * Returns the count of rows updated so the caller can fire an SSE
 * `chat` notification to fan out the change to other connected
 * devices (the originating device already sees the reconciled state
 * via the immediate findMany result).
 */
export async function reconcileOrphanMeetingCards(
  userId: string,
): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - ORPHAN_RECONCILE_GRACE_MS);

  // Pull every meeting-summary card older than the grace window —
  // ones still in flight are recent and left alone.
  const candidates = await prisma.chatMessage.findMany({
    where: {
      userId,
      role: "meeting-summary",
      createdAt: { lt: cutoff },
    },
    select: { id: true, meetingData: true },
  });

  const orphans: { id: string; meetingData: MeetingCardData }[] = [];
  const sessionIds = new Set<string>();
  for (const row of candidates) {
    const md = (row.meetingData ?? null) as MeetingCardData | null;
    if (!md || md.status !== "processing" || !md.sessionId) continue;
    sessionIds.add(md.sessionId);
    orphans.push({ id: row.id, meetingData: md });
  }
  if (orphans.length === 0) return 0;

  // Single batched query for all candidate sessionIds — most users
  // have <10 in-flight jobs ever, but this avoids N+1.
  const liveJobs = await prisma.transcriptionJob.findMany({
    where: { userId, sessionId: { in: Array.from(sessionIds) } },
    select: { sessionId: true },
  });
  const liveSet = new Set(liveJobs.map((j) => j.sessionId));

  let updated = 0;
  for (const orphan of orphans) {
    const sid = orphan.meetingData.sessionId!;
    if (liveSet.has(sid)) continue; // server still has the job; not stale
    await prisma.chatMessage.update({
      where: { id: orphan.id },
      data: {
        meetingData: {
          ...orphan.meetingData,
          status: "failed",
          errorMessage:
            orphan.meetingData.errorMessage ??
            "Recording was cancelled or interrupted before processing started.",
        },
      },
    });
    updated += 1;
  }
  return updated;
}

/**
 * Cross-user variant of `reconcileOrphanMeetingCards`. Used by the
 * periodic background sweep so orphans are discovered and resolved
 * even when no client has triggered a chat-history fetch.
 *
 * Returns a `Map<userId, count>` of users whose chat history was
 * actually updated, so the caller can fire `sseHub.notifyChat(userId)`
 * for each affected user to fan the change out to their connected
 * devices.
 */
export async function reconcileAllOrphanMeetingCards(): Promise<
  Map<string, number>
> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - ORPHAN_RECONCILE_GRACE_MS);

  // Pull every user's `processing`-candidate cards in a single query.
  const candidates = await prisma.chatMessage.findMany({
    where: {
      role: "meeting-summary",
      createdAt: { lt: cutoff },
    },
    select: { id: true, userId: true, meetingData: true },
  });

  // Bucket by userId. Most users have 0 orphans, so the inner loop
  // is short for everyone except the rare cancel-mid-upload case.
  const orphansByUser = new Map<
    string,
    { id: string; meetingData: MeetingCardData }[]
  >();
  const sessionIds = new Set<string>();
  for (const row of candidates) {
    const md = (row.meetingData ?? null) as MeetingCardData | null;
    if (!md || md.status !== "processing" || !md.sessionId) continue;
    const list = orphansByUser.get(row.userId) ?? [];
    list.push({ id: row.id, meetingData: md });
    orphansByUser.set(row.userId, list);
    sessionIds.add(md.sessionId);
  }
  if (sessionIds.size === 0) return new Map();

  // Single query for ALL candidate sessionIds across all users —
  // sessionIds are random enough to be globally unique in practice.
  const liveJobs = await prisma.transcriptionJob.findMany({
    where: { sessionId: { in: Array.from(sessionIds) } },
    select: { sessionId: true },
  });
  const liveSet = new Set(liveJobs.map((j) => j.sessionId));

  const updated = new Map<string, number>();
  for (const [userId, orphans] of orphansByUser) {
    let count = 0;
    for (const orphan of orphans) {
      const sid = orphan.meetingData.sessionId!;
      if (liveSet.has(sid)) continue;
      await prisma.chatMessage.update({
        where: { id: orphan.id },
        data: {
          meetingData: {
            ...orphan.meetingData,
            status: "failed",
            errorMessage:
              orphan.meetingData.errorMessage ??
              "Recording was cancelled or interrupted before processing started.",
          },
        },
      });
      count += 1;
    }
    if (count > 0) updated.set(userId, count);
  }
  return updated;
}

export async function getChatHistory(userId: string): Promise<ChatMessageRow[]> {
  const prisma = getPrisma();
  // Reconcile is the route handler's responsibility (it needs the
  // count to fire sseHub.notifyChat for other connected devices).
  // Keeping it out of here also means in-process callers — like
  // tests — get a deterministic read.
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
