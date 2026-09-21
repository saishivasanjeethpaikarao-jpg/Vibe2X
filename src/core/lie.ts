import * as SQLite from 'expo-sqlite';
import { Track } from './types';
// We will redefine HistoryEntry locally or import it.
// Since HistoryEntry in LibraryService relies on track and id, let's just type it here.
export type HistoryEntry = {
  id: string;
  track: Track;
  playedAt: number;
};

const DB_NAME = 'vibe2x_lie.db';
let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS plays (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      track_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plays_timestamp ON plays(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_plays_track_id ON plays(track_id);
    
    CREATE TABLE IF NOT EXISTS suppressed_tracks (
      track_id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS taste_profile (
      artist_id TEXT PRIMARY KEY,
      weight INTEGER NOT NULL
    );
  `);
  
  return db;
}

export async function logPlay(entry: HistoryEntry) {
  const database = await initDatabase();
  await database.runAsync(
    'INSERT OR IGNORE INTO plays (id, track_id, timestamp, track_json) VALUES (?, ?, ?, ?)',
    entry.id,
    entry.track.id,
    entry.playedAt,
    JSON.stringify(entry.track)
  );
}

export async function batchLogPlays(entries: HistoryEntry[]) {
  const database = await initDatabase();
  for (const entry of entries) {
    await database.runAsync(
      'INSERT OR IGNORE INTO plays (id, track_id, timestamp, track_json) VALUES (?, ?, ?, ?)',
      entry.id,
      entry.track.id,
      entry.playedAt,
      JSON.stringify(entry.track)
    );
  }
}

export async function getListenHistory(limit = 100): Promise<HistoryEntry[]> {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>(
    'SELECT id, timestamp, track_json FROM plays ORDER BY timestamp DESC LIMIT ?',
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    playedAt: r.timestamp,
    track: JSON.parse(r.track_json) as Track,
  }));
}

export async function clearListenHistory() {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM plays');
}
export async function suppressTrack(trackId: string) {
  const database = await initDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO suppressed_tracks (track_id, timestamp) VALUES (?, ?)',
    trackId,
    Date.now()
  );
}

export async function getSuppressedTrackIds(): Promise<Set<string>> {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT track_id FROM suppressed_tracks');
  return new Set(rows.map((r) => r.track_id));
}

export async function getVibeMemoryTracks(limit = 20): Promise<Track[]> {
  const database = await initDatabase();
  // Vibe Memory: Group history by track_id, rank by count, within the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await database.getAllAsync<any>(`
    SELECT track_json, COUNT(*) as play_count 
    FROM plays 
    WHERE timestamp > ? 
    GROUP BY track_id 
    ORDER BY play_count DESC 
    LIMIT ?
  `, thirtyDaysAgo, limit);
  
  return rows.map(r => JSON.parse(r.track_json) as Track);
}

export async function getRecentTrackIds(hours = 12): Promise<Set<string>> {
  const database = await initDatabase();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const rows = await database.getAllAsync<any>('SELECT track_id FROM plays WHERE timestamp > ?', cutoff);
  return new Set(rows.map(r => r.track_id));
}
