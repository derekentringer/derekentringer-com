/**
 * Simple fuzzy string matching. Returns a score (higher = better match)
 * or -1 if no match. Matches characters in order, not necessarily contiguous.
 */
export function fuzzyMatch(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match gets highest score
  if (t.includes(q)) {
    return 1000 - t.indexOf(q);
  }

  // Fuzzy: match characters in order
  let qi = 0;
  let score = 0;
  let prevIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      // Consecutive matches score higher
      score += (prevIdx === ti - 1) ? 10 : 1;
      // Matches at word boundaries score higher
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === ":" || t[ti - 1] === "-") {
        score += 5;
      }
      prevIdx = ti;
    }
  }

  // All query characters must match
  return qi === q.length ? score : -1;
}

/**
 * Filter and sort items by fuzzy match against a query.
 * Returns items that match, sorted by score (best first).
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  if (!query) return items;
  const scored = items
    .map((item) => ({ item, score: fuzzyMatch(query, getText(item)) }))
    .filter((s) => s.score >= 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
