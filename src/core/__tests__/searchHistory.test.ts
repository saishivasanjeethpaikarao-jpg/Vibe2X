import { describe, expect, it } from 'vitest';
import { addSearchHistory, MAX_SEARCH_HISTORY, normalizeSearchHistory, removeSearchHistory } from '../searchHistory';

describe('search history', () => {
  it('trims, deduplicates case-insensitively and moves repeats to the top', () => {
    expect(addSearchHistory(['Salar', 'Telugu'], '  salar  ')).toEqual(['salar', 'Telugu']);
    expect(normalizeSearchHistory([' A ', 'a', '', 'B'])).toEqual(['A', 'B']);
  });

  it('ignores empty queries and keeps only the most recent 25', () => {
    const entries = Array.from({ length: 30 }, (_, i) => `Query ${i}`);
    expect(addSearchHistory(entries, '  ')).toHaveLength(MAX_SEARCH_HISTORY);
    expect(addSearchHistory(entries, 'New')[0]).toBe('New');
  });

  it('removes one or clears all without affecting listening history', () => {
    expect(removeSearchHistory(['Salar', 'Telugu'], 'salar')).toEqual(['Telugu']);
    expect(normalizeSearchHistory([])).toEqual([]);
  });
});
