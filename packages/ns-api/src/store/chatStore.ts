import { getPrisma } from "../lib/prisma.js";
import { randomUUID } from "node:crypto";

export interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  sources: unknown | null;
  meetingData: unknown | null;
  noteCards: unknown | null;
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
      createdAt: true,
    },
  });
}

export async function appendChatMessages(
  userId: string,
  messages: { role: string; content: string; sources?: unknown; meetingData?: unknown; noteCards?: unknown }[],
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
      },
      select: {
        id: true,
        role: true,
        content: true,
        sources: true,
        meetingData: true,
        noteCards: true,
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
