import { describe, expect, it } from 'vitest';
import { Track } from '../../../core/types';
import { PlaylistImportEngine } from '../engine';
import { matchSpotifyTrack } from '../matching';
import { normalizeMetadata } from '../normalization';
import { SourcePlaylist, SourceTrack } from '../types';

const entries = [
  ['నాటు నాటు', 'Naatu Naatu', 'Rahul Sipligunj'],
  ['तुम ही हो', 'Tum Hi Ho', 'Arijit Singh'],
  ['நிலா', 'Nila', 'A R Rahman'],
  ['ನಾಟು ನಾಟು', 'Naatu Naatu', 'Rahul Sipligunj'],
  ['മലരേ', 'Malare', 'Vijay Yesudas'],
  ['Kesariya (Official Audio)', 'Kesariya', 'Arijit Singh'],
  ['Believer', 'Believer', 'Imagine Dragons'],
  ['Stay', 'Stay', 'Zedd'],
  ['Jóga', 'Joga', 'Björk'],
  ['Unlisted Fixture Song', '', 'Unknown'],
] as const;

function track(title: string, artist: string): Track {
  return { id: `youtube:${title}:${artist}`, provider: 'youtube', sourceId: title, title,
    artist: { id: artist, name: artist }, album: 'Fixture Album', duration: 200, albumImageUrl: '' };
}

const catalog = entries.filter(([, roman]) => roman).map(([, roman, artist]) => track(roman, artist));
const fixture: SourcePlaylist = { source: 'file', sourcePlaylistId: 'multilingual-fixture', sourcePlaylistUrl: '',
  name: 'Multilingual Fixture', description: '', creator: 'You', unavailableCount: 0, duplicateCount: 0,
  tracks: entries.map(([title, , artist], position) => ({ key: String(position), sourceId: String(position), position,
    title, artists: [artist], album: 'Fixture Album', duration: 200 })) };

function search(query: string): Promise<Track[]> {
  return new Promise((resolve) => setTimeout(() => {
    const key = normalizeMetadata(query);
    resolve(catalog.filter((candidate) => key.includes(normalizeMetadata(candidate.title))));
  }, 8));
}

/** The prior serial first-query/title-only schedule, retained only as a deterministic QA comparison. */
async function priorQuerySchedule(tracks: SourceTrack[]) {
  const matches = [];
  const started = Date.now();
  for (const source of tracks) {
    let candidates = await search(`${source.title} ${source.artists.join(' ')}`);
    if (!matchSpotifyTrack(source, candidates).alternatives.length && source.artists.length) {
      candidates = [...candidates, ...await search(source.title)];
    }
    matches.push(matchSpotifyTrack(source, candidates));
  }
  return { matches, elapsedMs: Date.now() - started };
}

describe('same multilingual QA fixture comparison', () => {
  it('reduces false unavailable classifications and records local-only timing', async () => {
    const prior = await priorQuerySchedule(fixture.tracks);
    const unused = { fetchPlaylist: async () => { throw new Error('unused'); } };
    const importer = new PlaylistImportEngine({ youtube: unused, spotify: unused, searchTracks: search });
    const started = Date.now();
    const after = await importer.matchMetadata(fixture, new AbortController().signal);
    const afterMs = Date.now() - started;
    const prepared = importer.prepareMatched(fixture, after);
    const oldFalseUnavailable = prior.matches.filter((item) => item.confidence === 'NO_MATCH').length;
    expect(fixture.tracks).toHaveLength(10);
    expect(oldFalseUnavailable).toBeGreaterThan(prepared.notFoundCount);
    expect(prepared.unavailableCount).toBe(0);
    expect(prepared.automaticallyMatched).toBeGreaterThan(prior.matches.filter((item) => item.confidence === 'HIGH').length);
    console.info('[playlist-import] FIXTURE_COMPARISON', {
      total: fixture.tracks.length,
      priorAuto: prior.matches.filter((item) => item.confidence === 'HIGH').length,
      priorLabeledUnavailable: oldFalseUnavailable,
      priorMs: prior.elapsedMs,
      afterAuto: prepared.automaticallyMatched,
      afterReview: prepared.needsReview,
      afterNotFound: prepared.notFoundCount,
      afterUnavailable: prepared.unavailableCount,
      afterMs,
      afterAverageMs: Number((afterMs / fixture.tracks.length).toFixed(1)),
      rows: after.map((item) => [item.source.title, item.confidence]),
    });
  });
});
