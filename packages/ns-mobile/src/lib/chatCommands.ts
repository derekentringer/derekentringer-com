// Phase A.3 (mobile parity): slash commands.
//
// Mirrors `packages/ns-{web,desktop}/src/lib/chatCommands.ts` for
// command shape (`ChatCommand`, `CommandContext`, `CommandResult`,
// `parseCommand`, `filterCommands`) so the wire-level set of
// commands stays consistent across all three clients. Mobile's
// implementations route through the local SQLite layer
// (`lib/noteStore.ts`) so they work offline; the sync engine
// propagates changes to the server on the next push tick.
//
// The set of commands ported in this PR is the subset whose
// dependencies already exist in mobile. Commands whose backing
// helpers haven't landed yet (summarize, gentags, rename*, savechat,
// stats, multi-arg tag) will arrive in subsequent sub-phases (A.4
// for confirmation-gated rename*, A.5 for savechat, A.6 for AI
// helpers).

import {
  createNoteLocal,
  deleteNoteLocal,
  deleteFolderLocal,
  getAllNotes,
  getFolders,
  getNote,
  renameFolderLocal,
  restoreNoteLocal,
  toggleFavoriteLocal,
  updateNoteLocal,
} from "./noteStore";
import {
  defaultChatTitle,
  serializeChatToMarkdown,
  type ExportMessage,
} from "./chatExport";
import {
  summarizeNote as apiSummarizeNote,
  suggestTags as apiSuggestTags,
  type NoteCard,
} from "@/api/ai";

export interface ChatCommand {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  /** Wipes the chat (no server call — pure UI state). */
  clearChat: () => void;
  /** Opens a note in the AI tab's stack. Implemented by AiScreen. */
  openInTab?: (noteId: string) => void;
  /** Snapshot of the current chat for /savechat. AiScreen passes
   *  the in-memory messages array. */
  getChatMessages?: () => ExportMessage[];
}

export interface CommandResult {
  text: string;
  noteCards?: NoteCard[];
  /** When true, the command result should NOT render as a chat
   *  message (e.g. /clear). */
  silent?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Strict-ish title match — case-insensitive equality first, then
 *  fall back to startsWith if no exact hit. Mobile commands lean
 *  toward leniency since typing on mobile is harder. */
async function findNoteByTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const all = await getAllNotes({ search: trimmed, limit: 10 });
  const exact =
    all.find((n) => n.title.toLowerCase() === trimmed.toLowerCase()) ?? null;
  if (exact) return exact;
  // Lenient fallback: startsWith match. Avoids the mobile pain of
  // having to type a perfect long title.
  return all.find((n) =>
    n.title.toLowerCase().startsWith(trimmed.toLowerCase()),
  ) ?? null;
}

async function findFolderByName(name: string) {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;
  const folders = await getFolders();
  function search(items: typeof folders): (typeof folders)[number] | null {
    for (const f of items) {
      if (f.name.toLowerCase() === trimmed) return f;
      const found = search(f.children);
      if (found) return found;
    }
    return null;
  }
  return search(folders);
}

function formatFolderTree(items: Awaited<ReturnType<typeof getFolders>>, indent = 0): string {
  return items
    .map((f) => {
      const prefix = "  ".repeat(indent);
      const head = `${prefix}${f.name}${f.count != null ? ` (${f.count})` : ""}`;
      const children = f.children.length > 0 ? "\n" + formatFolderTree(f.children, indent + 1) : "";
      return head + children;
    })
    .join("\n");
}

// ─── Command catalog ────────────────────────────────────────────

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    name: "create",
    description: "Create a new blank note",
    usage: "/create [title]",
    execute: async (args) => {
      const title = args.trim() || "Untitled";
      const note = await createNoteLocal({ title, content: "" });
      return {
        text: `Created "${note.title}".`,
        noteCards: [{ id: note.id, title: note.title }],
      };
    },
  },
  {
    name: "delete",
    description: "Move a note to trash",
    usage: "/delete [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /delete [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `No note found with title "${args.trim()}".` };
      await deleteNoteLocal(note.id);
      return { text: `Moved "${note.title}" to trash.` };
    },
  },
  {
    name: "deletefolder",
    description: "Delete a folder (notes inside become Unfiled)",
    usage: "/deletefolder [folder name]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /deletefolder [folder name]" };
      const folder = await findFolderByName(args.trim());
      if (!folder) return { text: `No folder found with name "${args.trim()}".` };
      await deleteFolderLocal(folder.id);
      return { text: `Deleted folder "${folder.name}".` };
    },
  },
  {
    name: "favorites",
    description: "List favorite notes",
    usage: "/favorites",
    execute: async () => {
      const notes = await getAllNotes({ favorite: true });
      if (notes.length === 0) return { text: "No favorite notes." };
      return {
        text: `${notes.length} favorite note(s):`,
        noteCards: notes.map((n) => ({ id: n.id, title: n.title })),
      };
    },
  },
  {
    name: "recent",
    description: "List recently edited notes",
    usage: "/recent",
    execute: async () => {
      const notes = await getAllNotes({ sortBy: "updatedAt", sortOrder: "desc", limit: 10 });
      if (notes.length === 0) return { text: "No recent notes." };
      return {
        text: `${notes.length} recently edited note(s):`,
        noteCards: notes.map((n) => ({
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
        })),
      };
    },
  },
  {
    name: "folders",
    description: "Show folder structure",
    usage: "/folders",
    execute: async () => {
      const folders = await getFolders();
      if (folders.length === 0) return { text: "No folders." };
      return { text: formatFolderTree(folders) };
    },
  },
  {
    name: "tags",
    description: "List all tags",
    usage: "/tags",
    execute: async () => {
      const all = await getAllNotes({});
      const counts = new Map<string, number>();
      for (const n of all) {
        for (const t of n.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      if (counts.size === 0) return { text: "No tags." };
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      const lines = sorted.map(([t, c]) => `#${t} (${c})`);
      return { text: `${counts.size} tag(s):\n${lines.join("\n")}` };
    },
  },
  {
    name: "open",
    description: "Open a note by title",
    usage: "/open [note title]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /open [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `Note "${args.trim()}" not found.` };
      ctx.openInTab?.(note.id);
      return {
        text: `Opened "${note.title}".`,
        noteCards: [{ id: note.id, title: note.title }],
      };
    },
  },
  {
    name: "favorite",
    description: "Mark a note as favorite",
    usage: "/favorite [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /favorite [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `No note found with title "${args.trim()}".` };
      await toggleFavoriteLocal(note.id, true);
      return { text: `Favorited "${note.title}".` };
    },
  },
  {
    name: "unfavorite",
    description: "Remove a note from favorites",
    usage: "/unfavorite [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /unfavorite [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `No note found with title "${args.trim()}".` };
      await toggleFavoriteLocal(note.id, false);
      return { text: `Unfavorited "${note.title}".` };
    },
  },
  {
    name: "trash",
    description: "List notes in trash",
    usage: "/trash",
    execute: async () => {
      const notes = await getAllNotes({ deletedOnly: true });
      if (notes.length === 0) return { text: "Trash is empty." };
      return {
        text: `${notes.length} note(s) in trash:`,
        noteCards: notes.map((n) => ({ id: n.id, title: n.title })),
      };
    },
  },
  {
    name: "restore",
    description: "Restore a note from trash",
    usage: "/restore [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /restore [note title]" };
      // Trashed notes need findNoteByTitle to look in deletedOnly results.
      const trashed = await getAllNotes({ deletedOnly: true });
      const note =
        trashed.find(
          (n) => n.title.toLowerCase() === args.trim().toLowerCase(),
        ) ??
        trashed.find((n) =>
          n.title.toLowerCase().startsWith(args.trim().toLowerCase()),
        );
      if (!note) return { text: `No trashed note found with title "${args.trim()}".` };
      await restoreNoteLocal(note.id);
      return { text: `Restored "${note.title}" from trash.` };
    },
  },
  {
    name: "duplicate",
    description: "Duplicate a note",
    usage: "/duplicate [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /duplicate [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `Note "${args.trim()}" not found.` };
      const copy = await createNoteLocal({
        title: `${note.title} (Copy)`,
        content: note.content,
        folderId: note.folderId ?? undefined,
        tags: note.tags,
      });
      return {
        text: `Duplicated as "${copy.title}".`,
        noteCards: [{ id: copy.id, title: copy.title }],
      };
    },
  },
  {
    name: "summarize",
    description: "AI-generate a summary for a note",
    usage: "/summarize [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /summarize [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `No note found with title "${args.trim()}".` };
      try {
        const summary = await apiSummarizeNote(note.id);
        if (!summary.trim()) return { text: `No summary returned for "${note.title}".` };
        // Persist the summary on the note so it shows in the
        // detail header — same effect as desktop.
        await updateNoteLocal(note.id, { summary });
        return {
          text: `Summary of "${note.title}":\n\n${summary}`,
          noteCards: [{ id: note.id, title: note.title }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Summarize failed.";
        return { text: `Failed to summarize: ${message}` };
      }
    },
  },
  {
    name: "gentags",
    description: "AI-suggest tags for a note",
    usage: "/gentags [note title]",
    execute: async (args) => {
      if (!args.trim()) return { text: "Usage: /gentags [note title]" };
      const note = await findNoteByTitle(args.trim());
      if (!note) return { text: `No note found with title "${args.trim()}".` };
      try {
        const tags = await apiSuggestTags(note.id);
        if (tags.length === 0) {
          return { text: `No tag suggestions for "${note.title}".` };
        }
        // Merge into existing tags, preserving prior ones.
        const merged = Array.from(new Set([...(note.tags ?? []), ...tags]));
        await updateNoteLocal(note.id, { tags: merged });
        return {
          text: `Suggested tags for "${note.title}": ${tags.map((t) => `#${t}`).join(", ")}`,
          noteCards: [{ id: note.id, title: note.title }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tag suggestion failed.";
        return { text: `Failed to suggest tags: ${message}` };
      }
    },
  },
  {
    name: "rename",
    description: "Rename a note",
    usage: "/rename [old title] to [new title]",
    execute: async (args) => {
      const match = args.match(/^(.+?)\s+to\s+(.+)$/i);
      if (!match) return { text: "Usage: /rename [old title] to [new title]" };
      const note = await findNoteByTitle(match[1].trim());
      if (!note) return { text: `No note found with title "${match[1].trim()}".` };
      const newTitle = match[2].trim();
      if (newTitle.length === 0) return { text: "New title cannot be empty." };
      await updateNoteLocal(note.id, { title: newTitle });
      return { text: `Renamed "${note.title}" to "${newTitle}".` };
    },
  },
  {
    name: "renamefolder",
    description: "Rename a folder",
    usage: "/renamefolder [old name] to [new name]",
    execute: async (args) => {
      const match = args.match(/^(.+?)\s+to\s+(.+)$/i);
      if (!match) return { text: "Usage: /renamefolder [old name] to [new name]" };
      const folder = await findFolderByName(match[1].trim());
      if (!folder) return { text: `No folder found with name "${match[1].trim()}".` };
      const newName = match[2].trim();
      if (newName.length === 0) return { text: "New name cannot be empty." };
      await renameFolderLocal(folder.id, newName);
      return { text: `Renamed folder "${folder.name}" to "${newName}".` };
    },
  },
  {
    name: "move",
    description: "Move a note to a folder",
    usage: "/move [note] to [folder]",
    execute: async (args) => {
      const match = args.match(/^(.+?)\s+to\s+(.+)$/i);
      if (!match) return { text: "Usage: /move [note title] to [folder name]" };
      const note = await findNoteByTitle(match[1].trim());
      if (!note) return { text: `No note found with title "${match[1].trim()}".` };
      const folder = await findFolderByName(match[2].trim());
      if (!folder) return { text: `No folder found with name "${match[2].trim()}".` };
      await updateNoteLocal(note.id, { folderId: folder.id });
      return { text: `Moved "${note.title}" to folder "${folder.name}".` };
    },
  },
  {
    name: "clear",
    description: "Clear chat history",
    usage: "/clear",
    execute: async (_args, ctx) => {
      ctx.clearChat();
      return { text: "", silent: true };
    },
  },
  {
    name: "savechat",
    description: "Save the current chat as a note",
    usage: "/savechat [title]",
    execute: async (args, ctx) => {
      const messages = ctx.getChatMessages?.() ?? [];
      // Drop the in-flight `/savechat` user message itself so it
      // doesn't show up as a "## You" turn at the bottom of the
      // exported note.
      const filtered = messages.filter(
        (m) => !(m.role === "user" && m.content.trim().toLowerCase().startsWith("/savechat")),
      );
      if (filtered.length === 0) {
        return { text: "Nothing to save — chat is empty." };
      }
      const title = args.trim() || defaultChatTitle();
      const content = serializeChatToMarkdown(filtered, {
        title,
        timestamp: new Date().toISOString(),
      });
      const note = await createNoteLocal({ title, content });
      return {
        text: `Saved chat as "${note.title}".`,
        noteCards: [{ id: note.id, title: note.title }],
      };
    },
  },
];

/** Parse input to check if it's a slash command. Returns null if
 *  the input isn't a recognized command. */
export function parseCommand(input: string): {
  command: ChatCommand;
  args: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  const cmdName = (
    spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1)
  ).toLowerCase();
  const args = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1) : "";
  const command = CHAT_COMMANDS.find((c) => c.name === cmdName);
  if (!command) return null;
  return { command, args };
}

/** Filter commands matching partial input for the typeahead picker.
 *  Returns the full catalog if input is just `/`. */
export function filterCommands(input: string): ChatCommand[] {
  if (!input.startsWith("/")) return [];
  const partial = input.slice(1).toLowerCase();
  if (!partial) return CHAT_COMMANDS;
  return CHAT_COMMANDS.filter((c) => c.name.startsWith(partial));
}

/** Helper used by `getNote` consumers to keep the API surface small. */
export const __forTesting = { findNoteByTitle, findFolderByName, getNote };
