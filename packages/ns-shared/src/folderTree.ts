import type { FolderInfo, FolderSortField, SortOrder } from "./types.js";

/**
 * For sorting by "Modified", each folder's effective activity is the
 * max of its own lastActivityAt and the effective activity of every
 * descendant. This lets parent folders bubble up when a deeply-nested
 * note was recently edited.
 */
function computeEffectiveActivity(
  folder: FolderInfo,
  cache: Map<string, number>,
): number {
  const cached = cache.get(folder.id);
  if (cached !== undefined) return cached;

  let best = folder.lastActivityAt ? Date.parse(folder.lastActivityAt) : 0;
  if (Number.isNaN(best)) best = 0;

  for (const child of folder.children) {
    const childBest = computeEffectiveActivity(child, cache);
    if (childBest > best) best = childBest;
  }

  cache.set(folder.id, best);
  return best;
}

/**
 * Returns a new tree with siblings at every level sorted by the given
 * field. The default (manual) order uses `sortOrder`; Name is
 * case-insensitive; Created and Modified sort by timestamp.
 */
export function sortFolderTree(
  folders: FolderInfo[],
  sortBy: FolderSortField,
  sortOrder: SortOrder,
): FolderInfo[] {
  const activityCache = new Map<string, number>();
  const dir = sortOrder === "asc" ? 1 : -1;

  const comparators: Record<
    FolderSortField,
    (a: FolderInfo, b: FolderInfo) => number
  > = {
    name: (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir,
    createdAt: (a, b) =>
      (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir,
    updatedAt: (a, b) =>
      (computeEffectiveActivity(a, activityCache) -
        computeEffectiveActivity(b, activityCache)) *
      dir,
  };

  const compare = comparators[sortBy];

  function sortLevel(nodes: FolderInfo[]): FolderInfo[] {
    const sorted = [...nodes].sort(compare);
    return sorted.map((n) => ({ ...n, children: sortLevel(n.children) }));
  }

  return sortLevel(folders);
}

/**
 * Case-insensitive substring filter that keeps ancestors of any
 * match so matches stay reachable in context. Returns a pruned tree.
 */
export function filterFolderTree(
  folders: FolderInfo[],
  query: string,
): FolderInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return folders;

  function walk(node: FolderInfo): FolderInfo | null {
    const selfMatches = node.name.toLowerCase().includes(q);
    const filteredChildren = node.children
      .map(walk)
      .filter((c): c is FolderInfo => c !== null);
    if (!selfMatches && filteredChildren.length === 0) return null;
    return { ...node, children: filteredChildren };
  }

  return folders.map(walk).filter((n): n is FolderInfo => n !== null);
}

/**
 * Collects the ids of every folder in the tree whose name OR any
 * descendant's name matches the query. Used by consumers to auto-
 * expand matches so the user can see them without clicking.
 */
export function folderIdsToExpandForFilter(
  folders: FolderInfo[],
  query: string,
): Set<string> {
  const q = query.trim().toLowerCase();
  const ids = new Set<string>();
  if (!q) return ids;

  function walk(node: FolderInfo): boolean {
    let anyMatch = node.name.toLowerCase().includes(q);
    for (const child of node.children) {
      if (walk(child)) anyMatch = true;
    }
    if (anyMatch) ids.add(node.id);
    return anyMatch;
  }

  for (const root of folders) walk(root);
  return ids;
}
