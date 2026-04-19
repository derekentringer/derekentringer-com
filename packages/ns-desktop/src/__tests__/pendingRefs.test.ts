import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock uuid — db.ts imports it at module load time.
vi.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

/**
 * Phase 3.2 — pending_refs referential deferral.
 *
 * The desktop SQLite deliberately has no FK constraints on columns
 * populated from sync payloads (migrations 013, 014). That tradeoff
 * prevents silent INSERT failures when a child arrives before its
 * parent in a sync batch — but it also means orphan references are
 * accepted silently. pending_refs is the app-level buffer that holds
 * those payloads until the parent materializes.
 *
 * These tests drive the db.ts helpers through the plugin-sql mock so
 * we can assert the SQL shape (what table was touched, with which
 * params) without needing a real SQLite. Matches the pattern the
 * existing db.test.ts uses.
 */

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: mockExecute,
      select: mockSelect,
    }),
  },
}));

const {
  upsertNoteFromRemote,
  upsertImageFromRemote,
  upsertFolderFromRemote,
  drainPendingRefsForFolder,
  drainPendingRefsForNote,
  enqueuePendingRef,
  countPendingRefs,
  sweepStalePendingRefs,
} = await import("../lib/db.ts");

const now = "2026-04-18T00:00:00.000Z";

function makeNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "note-1",
    title: "Test",
    content: "",
    folder: null,
    folderId: null as string | null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeImage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "image-1",
    noteId: "note-1",
    filename: "pic.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    r2Key: "image-1.png",
    r2Url: "https://r2.test/image-1.png",
    altText: "",
    aiDescription: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

// Capture every SQL that passes through execute/select so tests can
// inspect in order.
function calls() {
  return {
    executes: mockExecute.mock.calls.map((c) => ({
      sql: c[0] as string,
      params: (c[1] ?? []) as unknown[],
    })),
    selects: mockSelect.mock.calls.map((c) => ({
      sql: c[0] as string,
      params: (c[1] ?? []) as unknown[],
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default execute resolves with a shape ftsInsert + other db helpers
  // expect (`lastInsertId`). Tests that need to inspect params don't
  // override this.
  mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
});

describe("upsertNoteFromRemote — pending_refs deferral", () => {
  it("parks the payload when the referenced folder is missing", async () => {
    // folder lookup returns empty → orphan
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM folders")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await upsertNoteFromRemote(
      makeNote({ id: "note-1", folderId: "folder-missing" }),
    );

    const { executes } = calls();
    // Must NOT have written into notes.
    const noteInsert = executes.find((e) => /INSERT INTO notes/i.test(e.sql));
    expect(noteInsert).toBeUndefined();

    // Must have parked the payload in pending_refs. The helper first
    // deletes any prior deferral for the same entity, then inserts.
    const parkInsert = executes.find((e) =>
      /INSERT INTO pending_refs/i.test(e.sql),
    );
    expect(parkInsert).toBeDefined();
    expect(parkInsert!.params[0]).toBe("note");
    expect(parkInsert!.params[1]).toBe("note-1");
    expect(parkInsert!.params[2]).toBe("folder");
    expect(parkInsert!.params[3]).toBe("folder-missing");
    const parked = JSON.parse(parkInsert!.params[4] as string);
    expect(parked.id).toBe("note-1");
    expect(parked.folderId).toBe("folder-missing");
  });

  it("proceeds with the upsert when the referenced folder exists", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM folders")) {
        return Promise.resolve([{ id: "folder-1" }]);
      }
      if (sql.includes("FROM notes")) return Promise.resolve([]); // no existing row → insert
      return Promise.resolve([]);
    });

    await upsertNoteFromRemote(
      makeNote({ id: "note-1", folderId: "folder-1" }),
    );

    const { executes } = calls();
    const noteInsert = executes.find((e) => /INSERT INTO notes/i.test(e.sql));
    expect(noteInsert).toBeDefined();
    // No parking because parent resolves immediately.
    const parkInsert = executes.find((e) =>
      /INSERT INTO pending_refs/i.test(e.sql),
    );
    expect(parkInsert).toBeUndefined();
  });

  it("skips the parent check when folderId is null", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM notes")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await upsertNoteFromRemote(makeNote({ folderId: null }));

    const { selects, executes } = calls();
    // No folder lookup should have happened.
    const folderLookup = selects.find((s) => s.sql.includes("FROM folders"));
    expect(folderLookup).toBeUndefined();
    const noteInsert = executes.find((e) => /INSERT INTO notes/i.test(e.sql));
    expect(noteInsert).toBeDefined();
  });
});

describe("upsertImageFromRemote — pending_refs deferral", () => {
  it("parks the payload when the referenced note is missing", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM notes")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await upsertImageFromRemote(
      makeImage({ id: "image-1", noteId: "note-missing" }),
    );

    const { executes } = calls();
    const imageInsert = executes.find((e) =>
      /INSERT INTO images/i.test(e.sql),
    );
    expect(imageInsert).toBeUndefined();

    const parkInsert = executes.find((e) =>
      /INSERT INTO pending_refs/i.test(e.sql),
    );
    expect(parkInsert).toBeDefined();
    expect(parkInsert!.params[0]).toBe("image");
    expect(parkInsert!.params[1]).toBe("image-1");
    expect(parkInsert!.params[2]).toBe("note");
    expect(parkInsert!.params[3]).toBe("note-missing");
    const parked = JSON.parse(parkInsert!.params[4] as string);
    expect(parked.id).toBe("image-1");
    expect(parked.noteId).toBe("note-missing");
  });

  it("proceeds with the upsert when the referenced note exists", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM notes")) {
        return Promise.resolve([{ id: "note-1" }]);
      }
      if (sql.includes("FROM images")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await upsertImageFromRemote(
      makeImage({ id: "image-1", noteId: "note-1" }),
    );

    const { executes } = calls();
    const imageInsert = executes.find((e) =>
      /INSERT INTO images/i.test(e.sql),
    );
    expect(imageInsert).toBeDefined();
    const parkInsert = executes.find((e) =>
      /INSERT INTO pending_refs/i.test(e.sql),
    );
    expect(parkInsert).toBeUndefined();
  });
});

describe("drainPendingRefsForFolder", () => {
  it("replays parked notes when the folder arrives", async () => {
    // First call: fetchPendingRefs → returns one parked note.
    // Subsequent calls during replay: folder lookup finds folder-1,
    // notes table has no existing row → insert.
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM pending_refs WHERE ref_type")) {
        return Promise.resolve([
          {
            id: 42,
            entity_type: "note",
            entity_id: "note-stuck",
            ref_type: "folder",
            ref_id: "folder-1",
            payload: JSON.stringify(
              makeNote({ id: "note-stuck", folderId: "folder-1" }),
            ),
            enqueued_at: "2026-04-18 00:00:00",
          },
        ]);
      }
      if (sql.includes("FROM folders")) {
        return Promise.resolve([{ id: "folder-1" }]);
      }
      if (sql.includes("FROM notes")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await drainPendingRefsForFolder("folder-1");

    const { executes } = calls();
    // Parked row removed…
    const deleteRow = executes.find(
      (e) =>
        /DELETE FROM pending_refs WHERE id/i.test(e.sql) && e.params[0] === 42,
    );
    expect(deleteRow).toBeDefined();
    // …and the note was materialized.
    const noteInsert = executes.find((e) => /INSERT INTO notes/i.test(e.sql));
    expect(noteInsert).toBeDefined();
    expect(noteInsert!.params.includes("note-stuck")).toBe(true);
  });
});

describe("drainPendingRefsForNote", () => {
  it("replays parked images when the note arrives", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM pending_refs WHERE ref_type")) {
        return Promise.resolve([
          {
            id: 99,
            entity_type: "image",
            entity_id: "image-stuck",
            ref_type: "note",
            ref_id: "note-1",
            payload: JSON.stringify(
              makeImage({ id: "image-stuck", noteId: "note-1" }),
            ),
            enqueued_at: "2026-04-18 00:00:00",
          },
        ]);
      }
      if (sql.includes("FROM notes")) {
        return Promise.resolve([{ id: "note-1" }]);
      }
      if (sql.includes("FROM images")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await drainPendingRefsForNote("note-1");

    const { executes } = calls();
    const deleteRow = executes.find(
      (e) =>
        /DELETE FROM pending_refs WHERE id/i.test(e.sql) && e.params[0] === 99,
    );
    expect(deleteRow).toBeDefined();
    const imageInsert = executes.find((e) =>
      /INSERT INTO images/i.test(e.sql),
    );
    expect(imageInsert).toBeDefined();
    expect(imageInsert!.params.includes("image-stuck")).toBe(true);
  });
});

describe("enqueuePendingRef", () => {
  it("replaces any prior parking of the same entity before inserting", async () => {
    mockSelect.mockResolvedValue([]);

    await enqueuePendingRef(
      "note",
      "note-1",
      "folder",
      "folder-1",
      JSON.stringify(makeNote()),
    );

    const { executes } = calls();
    const deleteBefore = executes.find(
      (e) =>
        /DELETE FROM pending_refs WHERE entity_type/i.test(e.sql) &&
        e.params[0] === "note" &&
        e.params[1] === "note-1",
    );
    const parkInsert = executes.find((e) =>
      /INSERT INTO pending_refs/i.test(e.sql),
    );
    expect(deleteBefore).toBeDefined();
    expect(parkInsert).toBeDefined();
    // delete-before-insert ordering
    expect(mockExecute.mock.invocationCallOrder[0]).toBeLessThan(
      mockExecute.mock.invocationCallOrder[1],
    );
  });
});

describe("sweepStalePendingRefs", () => {
  it("deletes rows older than the cutoff and returns the count removed", async () => {
    mockSelect.mockResolvedValue([{ c: 3 }]);
    mockExecute.mockResolvedValue(undefined);

    const n = await sweepStalePendingRefs(7);

    expect(n).toBe(3);
    const { executes } = calls();
    const sweep = executes.find((e) =>
      /DELETE FROM pending_refs WHERE datetime/i.test(e.sql),
    );
    expect(sweep).toBeDefined();
  });
});

describe("countPendingRefs", () => {
  it("returns the current row count", async () => {
    mockSelect.mockResolvedValue([{ c: 5 }]);
    expect(await countPendingRefs()).toBe(5);
  });
});

describe("upsertFolderFromRemote drains folder-pending refs", () => {
  it("triggers a drain after a successful folder upsert", async () => {
    // First select: existing folder lookup (none — insert path).
    // Second select: drainPendingRefsForFolder's fetchPendingRefs → empty.
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("FROM folders")) return Promise.resolve([]);
      if (sql.includes("FROM pending_refs")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await upsertFolderFromRemote({
      id: "folder-1",
      name: "Work",
      parentId: null,
      sortOrder: 0,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const { selects } = calls();
    const drainLookup = selects.find((s) =>
      s.sql.includes("FROM pending_refs WHERE ref_type"),
    );
    expect(drainLookup).toBeDefined();
    expect(drainLookup!.params[0]).toBe("folder");
    expect(drainLookup!.params[1]).toBe("folder-1");
  });
});
