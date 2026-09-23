export const MAX_SEARCH_HISTORY = 25;

export function normalizeSearchHistory(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of items) {
    const query = typeof value === 'string' ? value.trim() : '';
    const key = query.toLocaleLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    result.push(query);
    if (result.length >= MAX_SEARCH_HISTORY) break;
  }
  return result;
}

export function addSearchHistory(items: string[], query: string): string[] {
  return normalizeSearchHistory([query, ...items]);
}

export function removeSearchHistory(items: string[], query: string): string[] {
  const key = query.trim().toLocaleLowerCase();
  return items.filter((item) => item.trim().toLocaleLowerCase() !== key);
}
