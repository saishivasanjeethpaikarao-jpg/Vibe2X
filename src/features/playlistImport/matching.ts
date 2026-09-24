import { Track } from '../../core/types';
import {
  MatchCandidate,
  MatchConfidence,
  SourceTrack,
  SpotifyTrackMatch,
} from './types';

const QUALIFIERS = [
  'live',
  'remix',
  'acoustic',
  'instrumental',
  'karaoke',
  'demo',
  'radio edit',
  'sped up',
  'slowed',
  'reverb',
];

const HARMLESS = /\b(official\s+(audio|video)|audio\s+only|lyric(s)?\s+video|visuali[sz]er)\b/gi;
const FEAT = /\b(featuring|feat\.?|ft\.?)\b/gi;

function titleCore(value: string): string {
  return value.replace(/[\s([{\-]+(?:featuring|feat\.?|ft\.?)\s+[^\])}]+[\])}]?\s*$/i, ' ');
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(FEAT, ' feat ')
    .replace(HARMLESS, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter(Boolean));
}

function overlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return (2 * common) / (a.size + b.size);
}

function qualifierSet(value: string): Set<string> {
  const normalized = normalizeText(value);
  return new Set(QUALIFIERS.filter((q) => normalized.includes(q)));
}

function sameQualifiers(left: string, right: string): boolean {
  const a = [...qualifierSet(left)].sort().join('|');
  const b = [...qualifierSet(right)].sort().join('|');
  return a === b;
}

function confidenceFor(score: number): MatchConfidence {
  if (score >= 0.88) return 'HIGH';
  if (score >= 0.72) return 'MEDIUM';
  if (score >= 0.58) return 'LOW';
  return 'NO_MATCH';
}

export function scoreTrackMatch(source: SourceTrack, candidate: Track): MatchCandidate | null {
  const reasons: string[] = [];
  const titleSimilarity = overlap(titleCore(source.title), titleCore(candidate.title));
  const sourceArtists = source.artists.map(normalizeText).filter(Boolean);
  const candidateArtists = candidate.artist.name
    .split(/\s*(?:,|&|\band\b|\bfeaturing\b|\bfeat\.?\b|\bft\.?\b)\s*/i)
    .map(normalizeText)
    .filter(Boolean);
  const combinedCandidateArtist = normalizeText(candidate.artist.name);
  if (combinedCandidateArtist) candidateArtists.push(combinedCandidateArtist);

  const primaryArtist = sourceArtists[0] ?? '';
  const primaryScore = Math.max(
    ...candidateArtists.map((artist) => overlap(primaryArtist, artist)),
    0
  );
  const allArtistScore = sourceArtists.length
    ? sourceArtists.reduce(
        (sum, artist) =>
          sum + Math.max(...candidateArtists.map((other) => overlap(artist, other)), 0),
        0
      ) / sourceArtists.length
    : 0;

  if (titleSimilarity > 0.95) reasons.push('title');
  if (primaryScore > 0.9) reasons.push('artist');

  let durationScore = 0.5;
  if (source.duration > 0 && candidate.duration > 0) {
    const delta = Math.abs(source.duration - candidate.duration);
    durationScore = Math.max(0, 1 - delta / 30);
    if (delta <= 4) reasons.push('duration');
  }

  const albumScore = source.album && candidate.album ? overlap(source.album, candidate.album) : 0.5;
  const titleOnly = sourceArtists.length === 0;
  let score = titleOnly
    ? titleSimilarity * 0.85 + durationScore * 0.1 + albumScore * 0.05
    : titleSimilarity * 0.5 + primaryScore * 0.27 + allArtistScore * 0.1 + durationScore * 0.08 + albumScore * 0.05;

  // Edition words are musically meaningful. A studio original must not be
  // silently replaced by a live/remix version with the same title and artist.
  if (!sameQualifiers(source.title, candidate.title)) {
    score -= 0.28;
    reasons.push('edition differs');
  }

  // Same-title songs by the wrong artist are never acceptable auto-matches.
  if (!titleOnly && primaryScore < 0.45) score -= 0.3;

  score = Math.max(0, Math.min(1, score));
  // Without an artist, a same-title song can be a different recording.
  // Surface it for review, but never silently auto-accept it.
  const confidence = titleOnly && score >= 0.58 ? 'MEDIUM' : confidenceFor(score);
  if (confidence === 'NO_MATCH') return null;

  return { track: candidate, score, confidence, reasons };
}

export function matchSpotifyTrack(source: SourceTrack, candidates: Track[]): SpotifyTrackMatch {
  const alternatives = candidates
    .map((track) => scoreTrackMatch(source, track))
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const best = alternatives[0];
  const ambiguous = best && alternatives[1] && best.score - alternatives[1].score < 0.04;
  const confidence: MatchConfidence = ambiguous && best.confidence === 'HIGH'
    ? 'MEDIUM'
    : best?.confidence ?? 'NO_MATCH';

  return {
    source,
    confidence,
    alternatives,
    selectedTrack: confidence === 'HIGH' ? best.track : null,
    // No alternatives cannot be reviewed into a match; count it as skipped.
    reviewed: confidence === 'HIGH' || !best,
  };
}
