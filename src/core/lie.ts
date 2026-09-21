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
