import type { FolderInfo } from "@derekentringer/ns-shared";

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
