import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

const TEST_USER_ID = "user-1";

afterEach(() => {
  vi.clearAllMocks();
});

import { captureVersion, listVersions, getVersion } from "../store/versionStore.js";

describe("captureVersion", () => {
  it("creates a version when no previous version exists", async () => {
    // Mock dynamic interval (default 15 min)
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.noteVersion.findFirst.mockResolvedValue(null);
    mockPrisma.noteVersion.create.mockResolvedValue({
      id: "v1",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt: new Date(),
    });
    mockPrisma.noteVersion.count.mockResolvedValue(1);

    await captureVersion("n1", "Title", "Content");

    expect(mockPrisma.noteVersion.create).toHaveBeenCalledWith({
      data: { noteId: "n1", title: "Title", content: "Content" },
    });
  });

  it("creates a version when elapsed time exceeds configured interval", async () => {
    // Mock interval set to 5 minutes
    mockPrisma.setting.findUnique.mockResolvedValue({
      id: "versionIntervalMinutes",
      value: "5",
      updatedAt: new Date(),
    });
    const oldDate = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
    mockPrisma.noteVersion.findFirst.mockResolvedValue({
      createdAt: oldDate,
    });
    mockPrisma.noteVersion.create.mockResolvedValue({
      id: "v2",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt: new Date(),
    });
    mockPrisma.noteVersion.count.mockResolvedValue(2);

    await captureVersion("n1", "Title", "Content");

    expect(mockPrisma.noteVersion.create).toHaveBeenCalled();
  });

  it("skips when elapsed time is within configured interval", async () => {
    // Mock interval set to 15 minutes (default)
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    const recentDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    mockPrisma.noteVersion.findFirst.mockResolvedValue({
      createdAt: recentDate,
    });

    await captureVersion("n1", "Title", "Content");

    expect(mockPrisma.noteVersion.create).not.toHaveBeenCalled();
  });

  it("always captures when interval is 0 (every save)", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({
      id: "versionIntervalMinutes",
      value: "0",
      updatedAt: new Date(),
    });
    mockPrisma.noteVersion.create.mockResolvedValue({
      id: "v3",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt: new Date(),
    });
    mockPrisma.noteVersion.count.mockResolvedValue(1);

    await captureVersion("n1", "Title", "Content");

    expect(mockPrisma.noteVersion.create).toHaveBeenCalled();
    // Should NOT check findFirst when interval is 0
    expect(mockPrisma.noteVersion.findFirst).not.toHaveBeenCalled();
  });

  it("enforces 50-version cap by deleting oldest", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.noteVersion.findFirst.mockResolvedValue(null);
    mockPrisma.noteVersion.create.mockResolvedValue({
      id: "v51",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt: new Date(),
    });
    mockPrisma.noteVersion.count.mockResolvedValue(51);
    mockPrisma.noteVersion.findMany.mockResolvedValue([{ id: "oldest-v" }]);
    mockPrisma.noteVersion.deleteMany.mockResolvedValue({ count: 1 });

    await captureVersion("n1", "Title", "Content");

    expect(mockPrisma.noteVersion.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["oldest-v"] } },
    });
  });
});

describe("listVersions", () => {
  it("returns versions newest-first with total", async () => {
    // listVersions now verifies note ownership first
    mockPrisma.note.findUnique.mockResolvedValue({ userId: TEST_USER_ID });
    const versions = [
      { id: "v2", noteId: "n1", title: "T2", content: "C2", createdAt: new Date() },
      { id: "v1", noteId: "n1", title: "T1", content: "C1", createdAt: new Date(Date.now() - 60000) },
    ];
    mockPrisma.noteVersion.findMany.mockResolvedValue(versions);
    mockPrisma.noteVersion.count.mockResolvedValue(2);

    const result = await listVersions(TEST_USER_ID, "n1");

    expect(result.versions).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockPrisma.noteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { noteId: "n1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("returns empty when no versions", async () => {
    mockPrisma.note.findUnique.mockResolvedValue({ userId: TEST_USER_ID });
    mockPrisma.noteVersion.findMany.mockResolvedValue([]);
    mockPrisma.noteVersion.count.mockResolvedValue(0);

    const result = await listVersions(TEST_USER_ID, "n1");

    expect(result.versions).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns empty when note belongs to different user", async () => {
    mockPrisma.note.findUnique.mockResolvedValue({ userId: "other-user" });

    const result = await listVersions(TEST_USER_ID, "n1");

    expect(result.versions).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("getVersion", () => {
  it("returns a version by ID", async () => {
    const createdAt = new Date();
    mockPrisma.noteVersion.findUnique.mockResolvedValue({
      id: "v1",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt,
      note: { userId: TEST_USER_ID },
    });

    const result = await getVersion(TEST_USER_ID, "v1");

    expect(result).toEqual({
      id: "v1",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt,
    });
  });

  it("returns null for nonexistent version", async () => {
    mockPrisma.noteVersion.findUnique.mockResolvedValue(null);

    const result = await getVersion(TEST_USER_ID, "nonexistent");

    expect(result).toBeNull();
  });

  it("returns null when version belongs to different user", async () => {
    mockPrisma.noteVersion.findUnique.mockResolvedValue({
      id: "v1",
      noteId: "n1",
      title: "Title",
      content: "Content",
      createdAt: new Date(),
      note: { userId: "other-user" },
    });

    const result = await getVersion(TEST_USER_ID, "v1");

    expect(result).toBeNull();
  });
});
