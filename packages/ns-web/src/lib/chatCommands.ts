export interface ChatCommand {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  createNote: (title: string) => Promise<{ id: string; title: string } | null>;
  moveNote: (noteTitle: string, folderName: string) => Promise<string>;
  tagNote: (noteTitle: string, tags: string[]) => Promise<string>;
  deleteNote: (noteTitle: string) => Promise<string>;
  deleteFolder: (folderName: string) => Promise<string>;
  summarizeNote: (noteTitle: string) => Promise<string>;
  generateTags: (noteTitle: string) => Promise<string>;
  listFavorites: () => Promise<{ id: string; title: string }[]>;
  listRecent: () => Promise<{ id: string; title: string; updatedAt: string }[]>;
  listFolders: () => Promise<string>;
  listTags: () => Promise<string>;
  getStats: () => Promise<string>;
  openNote: (noteTitle: string) => Promise<{ id: string; title: string } | null>;
  clearChat: () => void;
}

export interface CommandResult {
  text: string;
  noteCards?: { id: string; title: string; folder?: string; tags?: string[]; updatedAt?: string }[];
  /** If true, don't add as a message (e.g., /clear) */
  silent?: boolean;
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    name: "create",
    description: "Create a new blank note",
    usage: "/create [title]",
    execute: async (args, ctx) => {
      const title = args.trim() || "Untitled";
      const note = await ctx.createNote(title);
      if (!note) return { text: "Failed to create note." };
      return {
        text: `Created "${note.title}".`,
        noteCards: [{ id: note.id, title: note.title }],
      };
    },
  },
  {
    name: "move",
    description: "Move a note to a folder",
    usage: "/move [note] to [folder]",
    execute: async (args, ctx) => {
      const match = args.match(/^(.+?)\s+to\s+(.+)$/i);
      if (!match) return { text: 'Usage: /move [note title] to [folder name]' };
      return { text: await ctx.moveNote(match[1].trim(), match[2].trim()) };
    },
  },
  {
    name: "tag",
    description: "Add tags to a note",
    usage: "/tag [note] [tags...]",
    execute: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) return { text: 'Usage: /tag [note title] [tag1] [tag2] ...' };
      // Last words that start with # or are single words after the title
      // Simple heuristic: everything after the last quoted string or the first #-prefixed word
      const hashIdx = parts.findIndex((p) => p.startsWith("#"));
      let noteTitle: string;
      let tags: string[];
      if (hashIdx > 0) {
        noteTitle = parts.slice(0, hashIdx).join(" ");
        tags = parts.slice(hashIdx).map((t) => t.replace(/^#/, ""));
      } else {
        // Assume last word(s) are tags — take all but the first word as tags if ambiguous
        noteTitle = parts.slice(0, -1).join(" ");
        tags = [parts[parts.length - 1].replace(/^#/, "")];
      }
      return { text: await ctx.tagNote(noteTitle, tags) };
    },
  },
  {
    name: "delete",
    description: "Move a note to trash",
    usage: "/delete [note title]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /delete [note title]" };
      return { text: await ctx.deleteNote(args.trim()) };
    },
  },
  {
    name: "deletefolder",
    description: "Delete a folder",
    usage: "/deletefolder [folder name]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /deletefolder [folder name]" };
      return { text: await ctx.deleteFolder(args.trim()) };
    },
  },
  {
    name: "summarize",
    description: "AI-generate a summary for a note",
    usage: "/summarize [note title]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /summarize [note title]" };
      return { text: await ctx.summarizeNote(args.trim()) };
    },
  },
  {
    name: "gentags",
    description: "AI-suggest tags for a note",
    usage: "/gentags [note title]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /gentags [note title]" };
      return { text: await ctx.generateTags(args.trim()) };
    },
  },
  {
    name: "favorites",
    description: "List favorite notes",
    usage: "/favorites",
    execute: async (_args, ctx) => {
      const notes = await ctx.listFavorites();
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
    execute: async (_args, ctx) => {
      const notes = await ctx.listRecent();
      if (notes.length === 0) return { text: "No recent notes." };
      return {
        text: `${notes.length} recently edited note(s):`,
        noteCards: notes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt })),
      };
    },
  },
  {
    name: "folders",
    description: "Show folder structure",
    usage: "/folders",
    execute: async (_args, ctx) => ({ text: await ctx.listFolders() }),
  },
  {
    name: "tags",
    description: "List all tags",
    usage: "/tags",
    execute: async (_args, ctx) => ({ text: await ctx.listTags() }),
  },
  {
    name: "stats",
    description: "Note statistics",
    usage: "/stats",
    execute: async (_args, ctx) => ({ text: await ctx.getStats() }),
  },
  {
    name: "open",
    description: "Open a note by title",
    usage: "/open [note title]",
    execute: async (args, ctx) => {
      if (!args.trim()) return { text: "Usage: /open [note title]" };
      const note = await ctx.openNote(args.trim());
      if (!note) return { text: `Note "${args.trim()}" not found.` };
      return {
        text: `Opened "${note.title}".`,
        noteCards: [{ id: note.id, title: note.title }],
      };
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
];

/** Parse input to check if it's a slash command. Returns null if not a command. */
export function parseCommand(input: string): { command: ChatCommand; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const cmdName = (spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1)).toLowerCase();
  const args = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1) : "";

  const command = CHAT_COMMANDS.find((c) => c.name === cmdName);
  if (!command) return null;

  return { command, args };
}

/** Filter commands matching partial input for autocomplete */
export function filterCommands(input: string): ChatCommand[] {
  if (!input.startsWith("/")) return [];
  const partial = input.slice(1).toLowerCase();
  if (!partial) return CHAT_COMMANDS;
  return CHAT_COMMANDS.filter((c) => c.name.startsWith(partial));
}
