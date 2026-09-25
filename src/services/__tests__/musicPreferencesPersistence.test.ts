import { describe, expect, it, vi } from 'vitest';
const saved = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => saved.get(key) ?? null,
  setItem: async (key: string, value: string) => { saved.set(key, value); },
  removeItem: async (key: string) => { saved.delete(key); },
} }));
vi.mock('../../core/lie', () => ({
  getListenHistory: async () => [], logPlay: async () => {}, clearListenHistory: async () => {}, batchLogPlays: async () => {},
}));

describe('music preferences persistence', () => {
  it('saves onboarding taste and reloads edits after restart', async () => {
    saved.clear();
    const { LibraryService } = await import('../LibraryService');
    await LibraryService.load();
    await LibraryService.saveMusicPreferences({ languages: ['Telugu', 'Hindi'], favoriteArtists: [
      { artistId: 'UC1', provider: 'youtube', name: 'Anirudh' },
    ], onboardingCompleted: true });
    expect(LibraryService.getSettings().musicPreferences.favoriteArtists).toHaveLength(1);
    vi.resetModules();
    const { LibraryService: reloaded } = await import('../LibraryService');
    await reloaded.load();
    expect(reloaded.getSettings().musicPreferences.languages).toEqual(['Telugu', 'Hindi']);
    await reloaded.saveMusicPreferences({ languages: ['English'], favoriteArtists: [] });
    vi.resetModules();
    const { LibraryService: edited } = await import('../LibraryService');
    await edited.load();
    expect(edited.getSettings().musicPreferences).toMatchObject({ languages: ['English'], favoriteArtists: [], onboardingCompleted: true });
  });
});
