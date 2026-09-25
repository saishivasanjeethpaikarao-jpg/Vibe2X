import { describe, expect, it } from 'vitest';
import { normalizeMusicPreferences, toggleFavoriteArtist, toggleLanguage } from '../musicPreferences';

describe('local music taste', () => {
  it('supports language multi-select, deselection, and arbitrary future languages', () => {
    expect(toggleLanguage(['Telugu'], 'Hindi')).toEqual(['Telugu', 'Hindi']);
    expect(toggleLanguage(['Telugu', 'Hindi'], 'telugu')).toEqual(['Hindi']);
    expect(toggleLanguage([], '  Odia  ')).toEqual(['Odia']);
  });
  it('selects and unselects artists by stable provider identity', () => {
    const artist = { artistId: 'UC123', name: 'Anirudh', provider: 'youtube' };
    expect(toggleFavoriteArtist([], artist)).toEqual([artist]);
    expect(toggleFavoriteArtist([artist], { ...artist, name: 'Anirudh Ravichander' })).toEqual([]);
  });
  it('normalizes persisted data and preserves completion', () => {
    expect(normalizeMusicPreferences({ languages: ['Hindi', 'hindi', 'Telugu'], favoriteArtists: [], onboardingCompleted: true, updatedAt: 4 }))
      .toMatchObject({ languages: ['hindi', 'Telugu'], onboardingCompleted: true, updatedAt: 4 });
  });
});
