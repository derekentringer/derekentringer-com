import { describe, it, expect, vi } from "vitest";
import {
  isSupportedFile,
  titleFromFilename,
  parseFileList,
  extractFolderPaths,
  ensureFolderHierarchy,
  importFiles,
  sanitizeFilename,
  exportNoteAsText,
  exportNoteAsPdf,
} from "../lib/importExport.ts";
import type { FolderInfo } from "@derekentringer/shared/ns";

describe("isSupportedFile", () => {
  it("accepts .md files", () => {
    expect(isSupportedFile("readme.md")).toBe(true);
  });

  it("accepts .txt files", () => {
    expect(isSupportedFile("notes.txt")).toBe(true);
  });

  it("accepts .markdown files", () => {
    expect(isSupportedFile("doc.markdown")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isSupportedFile("README.MD")).toBe(true);
    expect(isSupportedFile("Notes.TXT")).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isSupportedFile("image.png")).toBe(false);
    expect(isSupportedFile("data.json")).toBe(false);
    expect(isSupportedFile("script.js")).toBe(false);
  });

  it("rejects files with no extension", () => {
    expect(isSupportedFile("README")).toBe(false);
  });
});

describe("titleFromFilename", () => {
  it("strips .md extension", () => {
    expect(titleFromFilename("My Note.md")).toBe("My Note");
  });

  it("strips .txt extension", () => {
    expect(titleFromFilename("todo.txt")).toBe("todo");
  });

  it("strips .markdown extension", () => {
    expect(titleFromFilename("guide.markdown")).toBe("guide");
  });

  it("handles filenames with multiple dots", () => {
    expect(titleFromFilename("v2.0.notes.md")).toBe("v2.0.notes");
  });

  it("returns filename as-is if no extension dot", () => {
    expect(titleFromFilename("README")).toBe("README");
  });
});

describe("sanitizeFilename", () => {
  it("replaces invalid characters", () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe("file_________name");
  });

  it("returns Untitled for empty string", () => {
    expect(sanitizeFilename("")).toBe("Untitled");
  });

  it("preserves valid filenames", () => {
    expect(sanitizeFilename("My Note")).toBe("My Note");
  });
});

describe("parseFileList", () => {
  function makeFile(name: string, relativePath?: string): File {
    const file = new File(["content"], name, { type: "text/plain" });
    if (relativePath) {
      Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
    }
    return file;
  }

  it("filters to supported files only", () => {
    const files = [makeFile("note.md"), makeFile("image.png"), makeFile("todo.txt")];
    const result = parseFileList(files);
    expect(result).toHaveLength(2);
    expect(result[0].file.name).toBe("note.md");
    expect(result[1].file.name).toBe("todo.txt");
  });

  it("uses filename as single path segment for flat files", () => {
    const files = [makeFile("note.md")];
    const result = parseFileList(files);
    expect(result[0].pathSegments).toEqual(["note.md"]);
  });

  it("parses webkitRelativePath for directory imports", () => {
    const files = [makeFile("note.md", "Work/Projects/note.md")];
    const result = parseFileList(files);
    expect(result[0].pathSegments).toEqual(["Work", "Projects", "note.md"]);
  });
});

describe("extractFolderPaths", () => {
  it("extracts unique folder paths sorted by depth", () => {
    const entries = [
      { file: new File([""], "a.md"), pathSegments: ["Root", "Sub", "a.md"] },
      { file: new File([""], "b.md"), pathSegments: ["Root", "b.md"] },
      { file: new File([""], "c.md"), pathSegments: ["Root", "Sub", "c.md"] },
    ];
    const paths = extractFolderPaths(entries);
    expect(paths).toEqual([
      ["Root"],
      ["Root", "Sub"],
    ]);
  });

  it("returns empty for flat files (no folder segments)", () => {
    const entries = [
      { file: new File([""], "a.md"), pathSegments: ["a.md"] },
    ];
    expect(extractFolderPaths(entries)).toEqual([]);
  });
});

describe("ensureFolderHierarchy", () => {
  const existingFolders: FolderInfo[] = [
    {
      id: "f1",
      name: "Work",
      parentId: null,
      sortOrder: 0,
      count: 0,
      totalCount: 0,
      createdAt: "",
      children: [],
    },
  ];

  it("reuses existing folders", async () => {
    const createFn = vi.fn();
    const map = await ensureFolderHierarchy([["Work"]], existingFolders, createFn);
    expect(createFn).not.toHaveBeenCalled();
    expect(map.get("Work")).toBe("f1");
  });

  it("creates missing folders", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "new-1" });
    const map = await ensureFolderHierarchy([["Personal"]], existingFolders, createFn);
    expect(createFn).toHaveBeenCalledWith("Personal", undefined);
    expect(map.get("Personal")).toBe("new-1");
  });

  it("creates nested folders with correct parent", async () => {
    const createFn = vi.fn()
      .mockResolvedValueOnce({ id: "new-sub" });
    const map = await ensureFolderHierarchy(
      [["Work"], ["Work", "Projects"]],
      existingFolders,
      createFn,
    );
    expect(createFn).toHaveBeenCalledWith("Projects", "f1");
    expect(map.get("Work/Projects")).toBe("new-sub");
  });
});

describe("importFiles", () => {
  it("creates notes with correct data", async () => {
    const file = new File(["# Hello"], "hello.md", { type: "text/plain" });
    const entries = [{ file, pathSegments: ["hello.md"] }];
    const createNoteFn = vi.fn().mockResolvedValue({});
    const createFolderFn = vi.fn();

    const result = await importFiles(entries, "folder-1", [], createNoteFn, createFolderFn);

    expect(createNoteFn).toHaveBeenCalledWith({
      title: "hello",
      content: "# Hello",
      folderId: "folder-1",
    });
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it("calls progress callback", async () => {
    const file = new File(["content"], "note.md");
    const entries = [{ file, pathSegments: ["note.md"] }];
    const createNoteFn = vi.fn().mockResolvedValue({});
    const progressFn = vi.fn();

    await importFiles(entries, null, [], createNoteFn, vi.fn(), progressFn);

    expect(progressFn).toHaveBeenCalledWith({
      current: 1,
      total: 1,
      currentFile: "note.md",
    });
  });

  it("handles errors gracefully", async () => {
    const file = new File(["content"], "note.md");
    const entries = [{ file, pathSegments: ["note.md"] }];
    const createNoteFn = vi.fn().mockRejectedValue(new Error("API error"));

    const result = await importFiles(entries, null, [], createNoteFn, vi.fn());

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain("note.md");
    expect(result.errors[0]).toContain("API error");
  });

  it("uses directory folder mapping instead of targetFolderId", async () => {
    const file = new File(["content"], "note.md");
    const entries = [{ file, pathSegments: ["Work", "note.md"] }];
    const existingFolders: FolderInfo[] = [{
      id: "f1", name: "Work", parentId: null, sortOrder: 0, count: 0, totalCount: 0, createdAt: "", children: [],
    }];
    const createNoteFn = vi.fn().mockResolvedValue({});

    await importFiles(entries, "other-folder", existingFolders, createNoteFn, vi.fn());

    expect(createNoteFn).toHaveBeenCalledWith({
      title: "note",
      content: "content",
      folderId: "f1",
    });
  });
});

describe("exportNoteAsText", () => {
  it("triggers download with .txt extension", () => {
    const mockClick = vi.fn();
    const mockCreateElement = vi.spyOn(document, "createElement");
    const mockCreateObjectURL = vi.fn(() => "blob:url");
    const mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    const mockAnchor = {
      href: "",
      download: "",
      click: mockClick,
    } as unknown as HTMLAnchorElement;
    mockCreateElement.mockReturnValueOnce(mockAnchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAnchor);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockAnchor);

    exportNoteAsText({ title: "My Note", content: "Some text content" });

    expect(mockAnchor.download).toBe("My Note.txt");
    expect(mockClick).toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalled();

    mockCreateElement.mockRestore();
  });
});

describe("exportNoteAsPdf", () => {
  it("opens a print window with rendered HTML", () => {
    const mockWrite = vi.fn();
    const mockClose = vi.fn();
    const mockPrint = vi.fn();
    const mockAddEventListener = vi.fn();
    const mockWindow = {
      document: { write: mockWrite, close: mockClose },
      print: mockPrint,
      addEventListener: mockAddEventListener,
    };
    vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

    const mockMarkdownToHtml = vi.fn((md: string) => `<p>${md}</p>`);
    exportNoteAsPdf({ title: "Test", content: "Hello" }, mockMarkdownToHtml);

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(mockMarkdownToHtml).toHaveBeenCalledWith("Hello");
    expect(mockWrite).toHaveBeenCalled();
    const html = mockWrite.mock.calls[0][0] as string;
    expect(html).toContain("<title>Test</title>");
    expect(html).toContain("<p>Hello</p>");
    expect(mockClose).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("does nothing when popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(() => exportNoteAsPdf({ title: "T", content: "C" }, () => "")).not.toThrow();
    vi.restoreAllMocks();
  });
});
