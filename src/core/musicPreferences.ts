export type FavoriteArtist = {
  artistId: string;
  name: string;
  provider?: string;
  artwork?: string;
};

export type MusicPreferences = {
  languages: string[];
  favoriteArtists: FavoriteArtist[];
  onboardingCompleted: boolean;
  updatedAt: number;
};

export const LANGUAGE_CHOICES = [
  'Telugu', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'English',
  'Punjabi', 'Bengali', 'Marathi', 'Gujarati', 'Other',
] as const;

export const DEFAULT_MUSIC_PREFERENCES: MusicPreferences = {
  languages: [], favoriteArtists: [], onboardingCompleted: false, updatedAt: 0,
};

export function toggleLanguage(languages: string[], language: string): string[] {
  const value = language.trim();
  if (!value) return languages;
  return languages.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())
    ? languages.filter((item) => item.toLocaleLowerCase() !== value.toLocaleLowerCase())
    : [...languages, value];
}

export function toggleFavoriteArtist(artists: FavoriteArtist[], artist: FavoriteArtist): FavoriteArtist[] {
  const key = `${artist.provider ?? ''}:${artist.artistId || artist.name.toLocaleLowerCase()}`;
  const existing = artists.some((item) => `${item.provider ?? ''}:${item.artistId || item.name.toLocaleLowerCase()}` === key);
  return existing ? artists.filter((item) => `${item.provider ?? ''}:${item.artistId || item.name.toLocaleLowerCase()}` !== key) : [...artists, artist];
}

export function normalizeMusicPreferences(value: unknown): MusicPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MUSIC_PREFERENCES };
  const raw = value as Partial<MusicPreferences>;
  const languages = Array.isArray(raw.languages) ? raw.languages.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim()).slice(0, 30) : [];
  const favoriteArtists = Array.isArray(raw.favoriteArtists) ? raw.favoriteArtists.filter((item): item is FavoriteArtist => !!item && typeof item.name === 'string' && typeof item.artistId === 'string').slice(0, 50) : [];
  return {
    languages: [...new Map(languages.map((item) => [item.toLocaleLowerCase(), item])).values()],
    favoriteArtists,
    onboardingCompleted: raw.onboardingCompleted === true,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}
