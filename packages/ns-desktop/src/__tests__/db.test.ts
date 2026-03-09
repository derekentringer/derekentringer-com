import { vi } from "vitest";

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

// Mock @tauri-apps/plugin-sql
const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => {
  return {
    default: {
      load: vi.fn().mockResolvedValue({
        execute: mockExecute,
        select: mockSelect,
      }),
    },
  };
});

// Import after mocks are set up
const {
  fetchNotes,
  fetchNoteById,
  createNote,
  updateNote,
  softDeleteNote,
  hardDeleteNote,
} = await import("../lib/db.ts");

const sampleRow = {
  id: "abc-123",
  title: "My Note",
  content: "Hello world",
  folder_id: null,
  tags: '["tag1","tag2"]',
  summary: "A summary",
  favorite: 0,
  sort_order: 1,
  is_deleted: 0,
  deleted_at: null,
  sync_status: "pending",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchNotes", () => {
  it("returns mapped notes from SQL rows", async () => {
    mockSelect.mockResolvedValue([sampleRow]);

    const notes = await fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      id: "abc-123",
      title: "My Note",
      content: "Hello world",
      folder: null,
      folderId: null,
      folderPath: null,
      tags: ["tag1", "tag2"],
      summary: "A summary",
      favorite: false,
      sortOrder: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      deletedAt: null,
    });
  });

  it("queries non-deleted notes ordered by updated_at", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes();

    expect(mockSelect).toHaveBeenCalledWith(
      "SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC",
    );
  });

  it("returns empty array when no notes exist", async () => {
    mockSelect.mockResolvedValue([]);
    const notes = await fetchNotes();
    expect(notes).toEqual([]);
  });
});

describe("fetchNoteById", () => {
  it("returns mapped note when found", async () => {
    mockSelect.mockResolvedValue([sampleRow]);
    const note = await fetchNoteById("abc-123");

    expect(note).not.toBeNull();
    expect(note!.id).toBe("abc-123");
    expect(note!.title).toBe("My Note");
  });

  it("returns null when note not found", async () => {
    mockSelect.mockResolvedValue([]);
    const note = await fetchNoteById("nonexistent");
    expect(note).toBeNull();
  });
});

describe("row mapping", () => {
  it("maps favorite 1 to true", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, favorite: 1 }]);
    const notes = await fetchNotes();
    expect(notes[0].favorite).toBe(true);
  });

  it("maps favorite 0 to false", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, favorite: 0 }]);
    const notes = await fetchNotes();
    expect(notes[0].favorite).toBe(false);
  });

  it("handles invalid tags JSON gracefully", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, tags: "not-json" }]);
    const notes = await fetchNotes();
    expect(notes[0].tags).toEqual([]);
  });

  it("handles empty tags string", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, tags: "" }]);
    const notes = await fetchNotes();
    expect(notes[0].tags).toEqual([]);
  });

  it("maps folder_id to folderId", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, folder_id: "folder-1" }]);
    const notes = await fetchNotes();
    expect(notes[0].folderId).toBe("folder-1");
  });

  it("maps deleted_at to deletedAt", async () => {
    mockSelect.mockResolvedValue([
      { ...sampleRow, deleted_at: "2024-06-01T00:00:00.000Z" },
    ]);
    const notes = await fetchNotes();
    expect(notes[0].deletedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("handles null summary", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, summary: "" }]);
    const notes = await fetchNotes();
    expect(notes[0].summary).toBeNull();
  });
});

describe("createNote", () => {
  it("generates UUID and inserts into database", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, id: "test-uuid-1234" }]);

    const note = await createNote({ title: "New Note" });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO notes");
    expect(params[0]).toBe("test-uuid-1234");
    expect(params[1]).toBe("New Note");
    expect(note.id).toBe("test-uuid-1234");
  });

  it("uses empty string defaults for title and content", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, id: "test-uuid-1234", title: "", content: "" }]);

    await createNote({});

    const [, params] = mockExecute.mock.calls[0];
    expect(params[1]).toBe(""); // title
    expect(params[2]).toBe(""); // content
  });

  it("returns fallback note if re-read fails", async () => {
    mockSelect.mockResolvedValue([]);

    const note = await createNote({ title: "Fallback" });

    expect(note.id).toBe("test-uuid-1234");
    expect(note.title).toBe("Fallback");
    expect(note.content).toBe("");
    expect(note.tags).toEqual([]);
    expect(note.favorite).toBe(false);
  });
});

describe("updateNote", () => {
  it("updates title and content", async () => {
    mockSelect.mockResolvedValue([
      { ...sampleRow, title: "Updated", content: "New content" },
    ]);

    const note = await updateNote("abc-123", {
      title: "Updated",
      content: "New content",
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("title =");
    expect(sql).toContain("content =");
    expect(note.title).toBe("Updated");
  });

  it("throws if note not found after update", async () => {
    mockSelect.mockResolvedValue([]);

    await expect(
      updateNote("missing-id", { title: "Test" }),
    ).rejects.toThrow("Note missing-id not found after update");
  });

  it("updates tags as JSON string", async () => {
    mockSelect.mockResolvedValue([sampleRow]);

    await updateNote("abc-123", { tags: ["a", "b"] });

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContain(JSON.stringify(["a", "b"]));
  });

  it("updates favorite as 0/1 integer", async () => {
    mockSelect.mockResolvedValue([sampleRow]);

    await updateNote("abc-123", { favorite: true });

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContain(1);
  });
});

describe("softDeleteNote", () => {
  it("sets is_deleted and deleted_at", async () => {
    await softDeleteNote("abc-123");

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("is_deleted = 1");
    expect(sql).toContain("deleted_at");
    expect(params[1]).toBe("abc-123");
  });
});

describe("hardDeleteNote", () => {
  it("deletes the row from database", async () => {
    await hardDeleteNote("abc-123");

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("DELETE FROM notes");
    expect(params[0]).toBe("abc-123");
  });
});
