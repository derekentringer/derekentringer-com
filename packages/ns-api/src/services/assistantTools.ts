import type Anthropic from "@anthropic-ai/sdk";
import { listNotes, listFolders, listTags, listFavoriteNotes, getDashboardData, createNote, updateNote, softDeleteNote, deleteFolderById, type ListNotesFilter } from "../store/noteStore.js";
import { getBacklinks } from "../store/linkStore.js";
import { toNote } from "../lib/mappers.js";
import { suggestTags, generateSummary } from "./aiService.js";

// ─── Tool Definitions (sent to Claude) ───────────────────

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_notes",
    description: "Search and filter the user's notes. Can filter by text query, folder name, tag, favorites, audio mode, and sort order. Returns note titles, folders, tags, dates, and snippets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Text to search for in note titles and content" },
        folder: { type: "string", description: "Filter by folder name" },
        tag: { type: "string", description: "Filter by tag name" },
        favorite: { type: "boolean", description: "If true, only return favorited notes" },
        audioMode: { type: "string", enum: ["meeting", "lecture", "memo", "verbatim"], description: "Filter by audio recording type" },
        sortBy: { type: "string", enum: ["updatedAt", "createdAt", "title"], description: "Sort field (default: updatedAt)" },
        limit: { type: "number", description: "Max results to return (default: 10, max: 25)" },
      },
      required: [],
    },
  },
  {
    name: "list_folders",
    description: "Get the user's folder structure with note counts. Returns folder names, nesting hierarchy, and how many notes are in each folder.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_tags",
    description: "Get all tags the user has used, with the count of notes per tag.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_note_stats",
    description: "Get summary statistics: total notes, favorite count, recent activity count, audio note count.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_recent_notes",
    description: "Get the most recently edited notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of notes to return (default: 10, max: 25)" },
      },
      required: [],
    },
  },
  {
    name: "get_note_content",
    description: "Get the full content of a specific note by its title. Use this when the user asks about the contents of a particular note.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The exact title of the note to retrieve" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_backlinks",
    description: "Find all notes that link to a given note (via [[wiki-links]]). Useful for understanding how notes are connected.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "The title of the note to find backlinks for" },
      },
      required: ["noteTitle"],
    },
  },
  {
    name: "open_note",
    description: "Open a note for the user. Use this when the user asks to open, view, or go to a specific note. Returns a clickable note card.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "The title of the note to open" },
      },
      required: ["noteTitle"],
    },
  },

  // ─── Action Tools ────────────────────────────────────────

  {
    name: "create_note",
    description: "Create a new note. Can optionally populate it with content based on a template or topic. Returns the created note.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Title for the new note" },
        content: { type: "string", description: "Markdown content for the note. Generate useful template content based on what the user asked for." },
        folder: { type: "string", description: "Folder name to place the note in (optional)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add to the note (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "move_note",
    description: "Move a note to a different folder.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "Title of the note to move" },
        folderName: { type: "string", description: "Name of the destination folder" },
      },
      required: ["noteTitle", "folderName"],
    },
  },
  {
    name: "tag_note",
    description: "Add tags to a note. Appends to existing tags by default.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "Title of the note to tag" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add to the note" },
      },
      required: ["noteTitle", "tags"],
    },
  },
  {
    name: "generate_tags",
    description: "Use AI to automatically suggest tags for a note based on its content.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "Title of the note to generate tags for" },
      },
      required: ["noteTitle"],
    },
  },
  {
    name: "generate_summary",
    description: "Use AI to generate a summary for a note based on its content.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "Title of the note to summarize" },
      },
      required: ["noteTitle"],
    },
  },
  {
    name: "delete_note",
    description: "Move a note to the trash (soft delete). The user can restore it later.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteTitle: { type: "string", description: "Title of the note to delete" },
      },
      required: ["noteTitle"],
    },
  },
  {
    name: "delete_folder",
    description: "Delete a folder. Notes inside become unfiled.",
    input_schema: {
      type: "object" as const,
      properties: {
        folderName: { type: "string", description: "Name of the folder to delete" },
      },
      required: ["folderName"],
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────

export interface ToolResult {
  text: string;
  noteCards?: { id: string; title: string; folder?: string; tags?: string[]; updatedAt?: string }[];
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case "search_notes":
      return executeSearchNotes(input, userId);
    case "list_folders":
      return executeListFolders(userId);
    case "list_tags":
      return executeListTags(userId);
    case "get_note_stats":
      return executeGetNoteStats(userId);
    case "get_recent_notes":
      return executeGetRecentNotes(input, userId);
    case "get_note_content":
      return executeGetNoteContent(input, userId);
    case "get_backlinks":
      return executeGetBacklinks(input, userId);
    case "open_note":
      return executeOpenNote(input, userId);
    case "create_note":
      return executeCreateNote(input, userId);
    case "move_note":
      return executeMoveNote(input, userId);
    case "tag_note":
      return executeTagNote(input, userId);
    case "generate_tags":
      return executeGenerateTags(input, userId);
    case "generate_summary":
      return executeGenerateSummary(input, userId);
    case "delete_note":
      return executeDeleteNote(input, userId);
    case "delete_folder":
      return executeDeleteFolder(input, userId);
    default:
      return { text: `Unknown tool: ${toolName}` };
  }
}

// ─── Tool Implementations ────────────────────────────────

async function executeSearchNotes(
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 10, 25);
  const filter: ListNotesFilter = {
    pageSize: limit,
    sortBy: (input.sortBy as ListNotesFilter["sortBy"]) ?? "updatedAt",
    sortOrder: "desc",
  };

  if (input.query) filter.search = String(input.query);
  if (input.folder) filter.folder = String(input.folder);
  if (input.tag) filter.tags = [String(input.tag)];

  let notes;
  if (input.favorite) {
    const favs = await listFavoriteNotes(userId);
    notes = favs.slice(0, limit);
  } else {
    const result = await listNotes(userId, filter);
    notes = result.notes;
  }

  const mapped = notes.map((n) => toNote(n));
  const noteCards = mapped.map((n) => ({
    id: n.id,
    title: n.title,
    folder: n.folder ?? undefined,
    tags: n.tags.length > 0 ? n.tags : undefined,
    updatedAt: n.updatedAt,
  }));

  if (mapped.length === 0) {
    return { text: "No notes found matching the criteria.", noteCards: [] };
  }

  const lines = mapped.map((n, i) => {
    const parts = [`${i + 1}. "${n.title}"`];
    if (n.folder) parts.push(`(folder: ${n.folder})`);
    if (n.tags.length > 0) parts.push(`[${n.tags.join(", ")}]`);
    if (n.audioMode) parts.push(`(${n.audioMode} recording)`);
    return parts.join(" ");
  });

  return {
    text: `Found ${mapped.length} note(s):\n${lines.join("\n")}`,
    noteCards,
  };
}

async function executeListFolders(userId: string): Promise<ToolResult> {
  const folders = await listFolders(userId);

  function formatTree(items: typeof folders, depth = 0): string[] {
    const lines: string[] = [];
    for (const f of items) {
      const indent = "  ".repeat(depth);
      lines.push(`${indent}- ${f.name} (${f.count} notes, ${f.totalCount} total)`);
      if (f.children.length > 0) {
        lines.push(...formatTree(f.children, depth + 1));
      }
    }
    return lines;
  }

  const lines = formatTree(folders);
  if (lines.length === 0) {
    return { text: "No folders found. All notes are unfiled." };
  }

  return { text: `Folder structure:\n${lines.join("\n")}` };
}

async function executeListTags(userId: string): Promise<ToolResult> {
  const tags = await listTags(userId);

  if (tags.length === 0) {
    return { text: "No tags found." };
  }

  const lines = tags.map((t) => `- ${t.name} (${t.count} notes)`);
  return { text: `Tags (${tags.length} total):\n${lines.join("\n")}` };
}

async function executeGetNoteStats(userId: string): Promise<ToolResult> {
  const dashboard = await getDashboardData(userId);
  const totalResult = await listNotes(userId, { pageSize: 1 });
  const tags = await listTags(userId);
  const folders = await listFolders(userId);

  function countFolders(items: typeof folders): number {
    let count = items.length;
    for (const f of items) count += countFolders(f.children);
    return count;
  }

  return {
    text: [
      `Total notes: ${totalResult.total}`,
      `Favorite notes: ${dashboard.favorites.length}`,
      `Audio notes: ${dashboard.audioNotes.length}`,
      `Recently edited (last 10): ${dashboard.recentlyEdited.length}`,
      `Total folders: ${countFolders(folders)}`,
      `Total tags: ${tags.length}`,
    ].join("\n"),
  };
}

async function executeGetRecentNotes(
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 10, 25);
  const result = await listNotes(userId, {
    pageSize: limit,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  const mapped = result.notes.map((n) => toNote(n));
  const noteCards = mapped.map((n) => ({
    id: n.id,
    title: n.title,
    folder: n.folder ?? undefined,
    tags: n.tags.length > 0 ? n.tags : undefined,
    updatedAt: n.updatedAt,
  }));

  const lines = mapped.map((n, i) => {
    const date = new Date(n.updatedAt).toLocaleDateString();
    return `${i + 1}. "${n.title}" (edited ${date})`;
  });

  return {
    text: `${mapped.length} most recent notes:\n${lines.join("\n")}`,
    noteCards,
  };
}

async function executeGetNoteContent(
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const title = String(input.title);
  const result = await listNotes(userId, { search: title, pageSize: 5 });

  // Find exact title match first, then closest
  const mapped = result.notes.map((n) => toNote(n));
  const exact = mapped.find((n) => n.title.toLowerCase() === title.toLowerCase());
  const note = exact ?? mapped[0];

  if (!note) {
    return { text: `No note found with title "${title}".` };
  }

  const content = note.content.length > 3000 ? note.content.slice(0, 3000) + "\n...(truncated)" : note.content;
  return {
    text: `Title: ${note.title}\nFolder: ${note.folder ?? "Unfiled"}\nTags: ${note.tags.join(", ") || "none"}\nLast edited: ${new Date(note.updatedAt).toLocaleDateString()}\n\nContent:\n${content}`,
    noteCards: [{ id: note.id, title: note.title, folder: note.folder ?? undefined, tags: note.tags.length > 0 ? note.tags : undefined, updatedAt: note.updatedAt }],
  };
}

async function executeGetBacklinks(
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const noteTitle = String(input.noteTitle);

  // Find the note by title first
  const result = await listNotes(userId, { search: noteTitle, pageSize: 5 });
  const mapped = result.notes.map((n) => toNote(n));
  const note = mapped.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? mapped[0];

  if (!note) {
    return { text: `No note found with title "${noteTitle}".` };
  }

  const backlinks = await getBacklinks(userId, note.id);

  if (backlinks.length === 0) {
    return { text: `No notes link to "${note.title}".` };
  }

  const noteCards = backlinks.map((b) => ({
    id: b.noteId,
    title: b.noteTitle,
  }));

  const lines = backlinks.map((b) => `- "${b.noteTitle}" (link text: "${b.linkText}")`);
  return {
    text: `${backlinks.length} note(s) link to "${note.title}":\n${lines.join("\n")}`,
    noteCards,
  };
}

// ─── Action Tool Implementations ─────────────────────────

async function findNoteByTitle(userId: string, title: string) {
  const result = await listNotes(userId, { search: title, pageSize: 5 });
  const mapped = result.notes.map((n) => toNote(n));
  return mapped.find((n) => n.title.toLowerCase() === title.toLowerCase()) ?? mapped[0] ?? null;
}

async function findFolderByName(userId: string, name: string) {
  const folders = await listFolders(userId);
  function search(items: typeof folders): typeof folders[number] | null {
    for (const f of items) {
      if (f.name.toLowerCase() === name.toLowerCase()) return f;
      const found = search(f.children);
      if (found) return found;
    }
    return null;
  }
  return search(folders);
}

async function executeOpenNote(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  return { text: `Here's "${note.title}":`, noteCards: [{ id: note.id, title: note.title, folder: note.folder ?? undefined, tags: note.tags.length > 0 ? note.tags : undefined, updatedAt: note.updatedAt }] };
}

async function executeCreateNote(
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const title = String(input.title || "Untitled");
  const content = String(input.content || "");
  const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];

  let folderId: string | undefined;
  if (input.folder) {
    const folder = await findFolderByName(userId, String(input.folder));
    if (folder) folderId = folder.id;
  }

  const note = await createNote(userId, {
    title,
    content,
    tags,
    folderId,
  });

  const mapped = toNote(note);
  return {
    text: `Created note "${mapped.title}"${folderId ? ` in folder` : ""}.`,
    noteCards: [{ id: mapped.id, title: mapped.title, folder: mapped.folder ?? undefined, tags: mapped.tags.length > 0 ? mapped.tags : undefined, updatedAt: mapped.updatedAt }],
  };
}

async function executeMoveNote(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  const folder = await findFolderByName(userId, String(input.folderName));
  if (!folder) return { text: `No folder found with name "${input.folderName}".` };
  await updateNote(userId, note.id, { folderId: folder.id });
  return { text: `Moved "${note.title}" to folder "${folder.name}".`, noteCards: [{ id: note.id, title: note.title, folder: folder.name }] };
}

async function executeTagNote(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  const newTags = Array.isArray(input.tags) ? input.tags.map(String) : [];
  const merged = [...new Set([...note.tags, ...newTags])];
  await updateNote(userId, note.id, { tags: merged });
  return { text: `Tagged "${note.title}" with: ${merged.join(", ")}`, noteCards: [{ id: note.id, title: note.title, tags: merged }] };
}

async function executeGenerateTags(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  const tags = await suggestTags(note.title, note.content, note.tags);
  return { text: `Suggested tags for "${note.title}": ${tags.join(", ")}`, noteCards: [{ id: note.id, title: note.title, tags }] };
}

async function executeGenerateSummary(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  const summary = await generateSummary(note.title, note.content);
  await updateNote(userId, note.id, { summary });
  return { text: `Summary for "${note.title}":\n${summary}`, noteCards: [{ id: note.id, title: note.title }] };
}

async function executeDeleteNote(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const note = await findNoteByTitle(userId, String(input.noteTitle));
  if (!note) return { text: `No note found with title "${input.noteTitle}".` };
  const deleted = await softDeleteNote(userId, note.id);
  if (!deleted) return { text: `Failed to delete "${note.title}".` };
  return { text: `Moved "${note.title}" to trash.` };
}

async function executeDeleteFolder(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  const folder = await findFolderByName(userId, String(input.folderName));
  if (!folder) return { text: `No folder found with name "${input.folderName}".` };
  await deleteFolderById(userId, folder.id);
  return { text: `Deleted folder "${folder.name}". Notes inside are now unfiled.` };
}
