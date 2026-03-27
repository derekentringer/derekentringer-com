export function findFolderName(
  folders: { id: string; name: string; children?: any[] }[],
  folderId: string | null | undefined,
): string | undefined {
  if (!folderId) return undefined;
  for (const f of folders) {
    if (f.id === folderId) return f.name;
    if (f.children?.length) {
      const found = findFolderName(f.children, folderId);
      if (found) return found;
    }
  }
  return undefined;
}
