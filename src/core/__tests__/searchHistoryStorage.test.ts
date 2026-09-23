import { describe, expect, it, vi } from 'vitest';

const backing = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => backing.get(key) ?? null,
    setItem: async (key: string, value: string) => { backing.set(key, value); },
    removeItem: async (key: string) => { backing.delete(key); },
  },
}));

import { flushWrites, readJson, STORAGE_KEYS, writeJsonDebounced } from '../storage';
import { addSearchHistory } from '../searchHistory';

describe('search history persistence', () => {
  it('survives a storage reload after the pending write is flushed', async () => {
    backing.clear();
    const history = addSearchHistory(['Salar'], 'Telugu');
    writeJsonDebounced(STORAGE_KEYS.searchHistory, history, 1000);
    expect(await flushWrites()).toBe(true);
    expect(await readJson(STORAGE_KEYS.searchHistory, [])).toEqual(['Telugu', 'Salar']);
    expect(JSON.parse(backing.get('note:v1:search-history') ?? '[]')).toEqual(['Telugu', 'Salar']);
  });
});
