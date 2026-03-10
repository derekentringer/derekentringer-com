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
const { captureVersion, listVersions, getVersion, restoreVersion } =
  await import("../lib/db.ts");

const sampleVersionRow = {
  id: "ver-1",
  note_id: "note-1",
  title: "Test Note",
  content: "Hello world",
  origin: "desktop",
  created_at: "2024-01-01T00:00:00.000Z",
};

const sampleNoteRow = {
  id: "note-1",
  title: "Test Note",
  content: "Hello world",
  folder_id: null,
  tags: "[]",
  summary: "",
  favorite: 0,
  sort_order: 0,
  is_deleted: 0,
  deleted_at: null,
  sync_status: "pending",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
};

beforeEach(() => {
  mockExecute.mockReset();
  mockSelect.mockReset();
});

describe("captureVersion", () => {
  it("creates a version when no previous version exists", async () => {
    // No previous versions
    mockSelect.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await captureVersion("note-1", "Title", "Content", 15);

    // Should INSERT into note_versions
    const insertCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO note_versions"),
    );
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0][1][0]).toBe("test-uuid-1234"); // id
    expect(insertCalls[0][1][1]).toBe("note-1"); // note_id
    expect(insertCalls[0][1][2]).toBe("Title"); // title
    expect(insertCalls[0][1][3]).toBe("Content"); // content
    expect(insertCalls[0][1][4]).toBe("desktop"); // origin
  });

  it("skips version creation when within interval", async () => {
    // Last version was 5 minutes ago, interval is 15 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockSelect.mockResolvedValueOnce([
      { ...sampleVersionRow, created_at: fiveMinAgo },
    ]);

    await captureVersion("note-1", "Title", "Content", 15);

    // Should NOT insert (still within cooldown)
    const insertCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO note_versions"),
    );
    expect(insertCalls.length).toBe(0);
  });

  it("creates version when elapsed time exceeds interval", async () => {
    // Last version was 20 minutes ago, interval is 15 minutes
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockSelect.mockResolvedValueOnce([
      { ...sampleVersionRow, created_at: twentyMinAgo },
    ]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await captureVersion("note-1", "Title", "Content", 15);

    const insertCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO note_versions"),
    );
    expect(insertCalls.length).toBe(1);
  });

  it("always captures when interval is 0 (every save)", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await captureVersion("note-1", "Title", "Content", 0);

    // Should NOT query for previous versions when interval is 0
    const selectCalls = mockSelect.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("note_versions"),
    );
    expect(selectCalls.length).toBe(0);

    // Should INSERT
    const insertCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO note_versions"),
    );
    expect(insertCalls.length).toBe(1);
  });

  it("enforces 50-version cap by deleting old versions", async () => {
    // No previous versions
    mockSelect.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await captureVersion("note-1", "Title", "Content", 15);

    // Should run DELETE with OFFSET 50
    const deleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM note_versions"),
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][0]).toContain("OFFSET");
    expect(deleteCalls[0][1][1]).toBe(50); // MAX_VERSIONS_PER_NOTE
  });
});

describe("listVersions", () => {
  it("returns versions newest-first with total", async () => {
    mockSelect.mockResolvedValueOnce([
      sampleVersionRow,
      { ...sampleVersionRow, id: "ver-2", created_at: "2024-01-02T00:00:00.000Z" },
    ]);

    const result = await listVersions("note-1");

    expect(result.versions).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.versions[0]).toEqual({
      id: "ver-1",
      noteId: "note-1",
      title: "Test Note",
      content: "Hello world",
      origin: "desktop",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    // Verify the query orders by created_at DESC
    expect(mockSelect.mock.calls[0][0]).toContain("ORDER BY created_at DESC");
  });

  it("returns empty list when no versions exist", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const result = await listVersions("note-1");

    expect(result.versions).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("getVersion", () => {
  it("returns a version when found", async () => {
    mockSelect.mockResolvedValueOnce([sampleVersionRow]);

    const version = await getVersion("ver-1");

    expect(version).not.toBeNull();
    expect(version!.id).toBe("ver-1");
    expect(version!.noteId).toBe("note-1");
    expect(version!.origin).toBe("desktop");
  });

  it("returns null when version not found", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const version = await getVersion("nonexistent");

    expect(version).toBeNull();
  });
});

describe("restoreVersion", () => {
  it("updates note title and content from version", async () => {
    // getVersion: SELECT version
    mockSelect.mockResolvedValueOnce([sampleVersionRow]);
    // updateNote: execute UPDATE, then ftsUpdate lookups, then fetchNoteById
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    mockSelect
      .mockResolvedValueOnce([]) // ftsUpdate: fts_map lookup
      .mockResolvedValueOnce([{ ...sampleNoteRow, title: "Test Note", content: "Hello world" }]) // fetchNoteById for fts
      .mockResolvedValueOnce([{ ...sampleNoteRow, title: "Test Note", content: "Hello world" }]); // fetchNoteById return

    const result = await restoreVersion("note-1", "ver-1");

    expect(result.title).toBe("Test Note");
    expect(result.content).toBe("Hello world");

    // Verify updateNote was called with the version's title and content
    const updateCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("UPDATE notes SET"),
    );
    expect(updateCalls.length).toBe(1);
  });

  it("throws when version not found", async () => {
    mockSelect.mockResolvedValueOnce([]); // getVersion returns null

    await expect(restoreVersion("note-1", "nonexistent")).rejects.toThrow(
      "Version nonexistent not found",
    );
  });
});
