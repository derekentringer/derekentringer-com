import JSZip from "jszip";
import type { Note, FolderInfo } from "@derekentringer/ns-shared";

const SUPPORTED_EXTENSIONS = [".md", ".txt", ".markdown"];

export interface ImportFileEntry {
  file: File;
  /** Path segments from directory import, e.g. ["Work", "Projects", "readme.md"] */
  pathSegments: string[];
}

export interface ImportProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  errors: string[];
}

export function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function titleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return filename;
  return filename.slice(0, lastDot);
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export function parseFileList(files: FileList | File[]): ImportFileEntry[] {
  const entries: ImportFileEntry[] = [];
  for (const file of files) {
    if (!isSupportedFile(file.name)) continue;
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const pathSegments = relativePath
      ? relativePath.split("/")
      : [file.name];
    entries.push({ file, pathSegments });
  }
  return entries;
}

export function extractFolderPaths(entries: ImportFileEntry[]): string[][] {
  const pathSet = new Set<string>();
  const paths: string[][] = [];

  for (const entry of entries) {
    // Skip the last segment (the filename)
    const folderSegments = entry.pathSegments.slice(0, -1);
    // Add each ancestor path
    for (let i = 1; i <= folderSegments.length; i++) {
      const pathKey = folderSegments.slice(0, i).join("/");
      if (!pathSet.has(pathKey)) {
        pathSet.add(pathKey);
        paths.push(folderSegments.slice(0, i));
      }
    }
  }

  // Sort by depth (parents first)
  paths.sort((a, b) => a.length - b.length);
  return paths;
}

export async function ensureFolderHierarchy(
  paths: string[][],
  existingFolders: FolderInfo[],
  createFolderFn: (name: string, parentId?: string) => Promise<{ id: string }>,
): Promise<Map<string, string>> {
  const folderMap = new Map<string, string>();

  // Index existing folders by (parentId, name)
  function indexExisting(folders: FolderInfo[], parentPath: string[]) {
    for (const f of folders) {
      const currentPath = [...parentPath, f.name];
      folderMap.set(currentPath.join("/"), f.id);
      indexExisting(f.children, currentPath);
    }
  }
  indexExisting(existingFolders, []);

  for (const path of paths) {
    const key = path.join("/");
    if (folderMap.has(key)) continue;

    const parentKey = path.slice(0, -1).join("/");
    const parentId = parentKey ? folderMap.get(parentKey) : undefined;
    const name = path[path.length - 1];

    const result = await createFolderFn(name, parentId);
    folderMap.set(key, result.id);
  }

  return folderMap;
}

export async function importFiles(
  entries: ImportFileEntry[],
  targetFolderId: string | null,
  folders: FolderInfo[],
  createNoteFn: (data: { title: string; content: string; folderId?: string }) => Promise<unknown>,
  createFolderFn: (name: string, parentId?: string) => Promise<{ id: string }>,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const errors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  // Build folder hierarchy if directory import
  const folderPaths = extractFolderPaths(entries);
  let folderMap = new Map<string, string>();

  if (folderPaths.length > 0) {
    folderMap = await ensureFolderHierarchy(folderPaths, folders, createFolderFn);
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.({ current: i + 1, total: entries.length, currentFile: entry.file.name });

    try {
      const content = await readFileAsText(entry.file);
      const title = titleFromFilename(entry.file.name);

      // Determine folder: directory import uses mapped folder, flat import uses target
      let folderId: string | undefined;
      const folderSegments = entry.pathSegments.slice(0, -1);
      if (folderSegments.length > 0) {
        const folderKey = folderSegments.join("/");
        folderId = folderMap.get(folderKey);
      } else if (targetFolderId) {
        folderId = targetFolderId;
      }

      await createNoteFn({ title, content, folderId });
      successCount++;
    } catch (err) {
      failedCount++;
      errors.push(`${entry.file.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return { successCount, failedCount, errors };
}

export type ExportFormat = "md" | "txt" | "pdf";

export function exportNoteAsMarkdown(note: Pick<Note, "title" | "content">): void {
  const filename = sanitizeFilename(note.title || "Untitled") + ".md";
  const blob = new Blob([note.content], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function exportNoteAsText(note: Pick<Note, "title" | "content">): void {
  const filename = sanitizeFilename(note.title || "Untitled") + ".txt";
  const blob = new Blob([note.content], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function exportNoteAsPdf(note: Pick<Note, "title" | "content">, markdownToHtml: (md: string) => string): void {
  const title = note.title || "Untitled";
  const bodyHtml = markdownToHtml(note.content);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 24px; }
h1 { font-size: 1.75em; font-weight: 700; margin: 1em 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }
h2 { font-size: 1.4em; font-weight: 700; margin: 1em 0 0.4em; }
h3 { font-size: 1.15em; font-weight: 600; margin: 0.8em 0 0.3em; }
p { margin: 0.6em 0; }
code { font-family: "Courier New", monospace; font-size: 0.9em; background: #f5f5f5; padding: 0.15em 0.4em; border-radius: 3px; }
pre { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; overflow-x: auto; margin: 0.8em 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #7c8a00; padding-left: 12px; margin: 0.6em 0; color: #666; font-style: italic; }
ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
li { margin: 0.25em 0; }
table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
th, td { border: 1px solid #e0e0e0; padding: 6px 12px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }
img { max-width: 100%; }
a { color: #7c8a00; }
@media print { body { padding: 0; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body></html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.addEventListener("afterprint", () => printWindow.close());
  setTimeout(() => printWindow.print(), 250);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildFolderPath(
  folderId: string,
  folderLookup: Map<string, { name: string; parentId: string | null }>,
): string {
  const parts: string[] = [];
  let current: string | null = folderId;
  while (current) {
    const folder = folderLookup.get(current);
    if (!folder) break;
    parts.unshift(sanitizeFilename(folder.name));
    current = folder.parentId;
  }
  return parts.join("/");
}

function flattenFoldersToLookup(
  folders: FolderInfo[],
): Map<string, { name: string; parentId: string | null }> {
  const map = new Map<string, { name: string; parentId: string | null }>();
  function walk(items: FolderInfo[]) {
    for (const f of items) {
      map.set(f.id, { name: f.name, parentId: f.parentId });
      walk(f.children);
    }
  }
  walk(folders);
  return map;
}

export async function exportNotesAsZip(
  notes: Pick<Note, "title" | "content" | "folderId">[],
  folders: FolderInfo[],
  zipName: string,
): Promise<void> {
  const zip = new JSZip();
  const folderLookup = flattenFoldersToLookup(folders);
  const usedNames = new Map<string, number>();

  for (const note of notes) {
    let baseName = sanitizeFilename(note.title || "Untitled");
    let dir = "";

    if (note.folderId) {
      dir = buildFolderPath(note.folderId, folderLookup);
      if (dir) dir += "/";
    }

    const fullBase = dir + baseName;
    const count = usedNames.get(fullBase) ?? 0;
    usedNames.set(fullBase, count + 1);
    if (count > 0) {
      baseName = `${baseName} (${count})`;
    }

    zip.file(dir + baseName + ".md", note.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, sanitizeFilename(zipName) + ".zip");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
