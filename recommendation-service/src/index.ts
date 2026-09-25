/** Stateless AI reranking boundary. It never sees names, accounts, or playback URLs. */
interface Env {
  AI_API_KEY: string;
  AI_PROVIDER_URL: string;
  AI_MODEL: string;
  RECOMMEND_LIMIT: RateLimit;
}

type MusicItem = { id: string; title: string; artist: string; album: string; duration: number };
type Candidate = MusicItem & { candidateId: string; deterministicScore: number };
type RequestBody = {
  current: MusicItem; session: MusicItem[]; searchQuery: string; languages: string[];
  favoriteArtists: string[]; likedArtists: string[]; skippedArtists: string[]; candidates: Candidate[];
};
type RankedItem = { candidateId: string; score: number };

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const MAX_BYTES = 16_384;
const MAX_CANDIDATES = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function stringWithin(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }
function validItem(value: unknown): value is MusicItem {
  return isRecord(value) && stringWithin(value.id, 120) && !!value.id &&
    stringWithin(value.title, 180) && !!value.title.trim() &&
    stringWithin(value.artist, 120) && !!value.artist.trim() &&
    stringWithin(value.album, 120) && typeof value.duration === 'number' &&
    Number.isFinite(value.duration) && value.duration >= 0 && value.duration <= 86400;
}
function validStrings(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) => stringWithin(entry, maxLength));
}
export function validRequest(value: unknown): value is RequestBody {
  if (!isRecord(value) || !validItem(value.current) || !Array.isArray(value.session) || value.session.length > 3 ||
      !value.session.every(validItem) || !stringWithin(value.searchQuery, 80) ||
      !validStrings(value.languages, 10, 40) || !validStrings(value.favoriteArtists, 10, 120) ||
      !validStrings(value.likedArtists, 5, 120) || !validStrings(value.skippedArtists, 5, 120) ||
      !Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > MAX_CANDIDATES) return false;
  const ids = new Set<string>();
  return value.candidates.every((candidate: unknown) => {
    if (!isRecord(candidate)) return false;
    const record = candidate;
    if (!validItem(candidate) || !stringWithin(record.candidateId, 120) ||
        record.candidateId !== record.id || !record.candidateId || ids.has(record.candidateId) ||
        typeof record.deterministicScore !== 'number' || !Number.isFinite(record.deterministicScore)) return false;
    ids.add(record.candidateId); return true;
  });
}

export function validModelRanks(value: unknown, candidates: Candidate[]): RankedItem[] | null {
  if (!isRecord(value) || !Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > candidates.length) return null;
  const allowed = new Set(candidates.map((candidate) => candidate.candidateId));
  const seen = new Set<string>();
  const result: RankedItem[] = [];
  for (const entry of value.tracks) {
    if (!isRecord(entry) || typeof entry.candidateId !== 'string' || !allowed.has(entry.candidateId) || seen.has(entry.candidateId) ||
        typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 1) return null;
    seen.add(entry.candidateId); result.push({ candidateId: entry.candidateId, score: entry.score });
  }
  return result;
}

/** Whitelist every field before forwarding; unknown client fields never reach AI. */
function sanitized(body: RequestBody): RequestBody {
  const item = (track: MusicItem): MusicItem => ({ id: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration });
  return {
    current: item(body.current), session: body.session.map(item), searchQuery: body.searchQuery,
    languages: [...body.languages], favoriteArtists: [...body.favoriteArtists], likedArtists: [...body.likedArtists],
    skippedArtists: [...body.skippedArtists],
    candidates: body.candidates.map((candidate) => ({ ...item(candidate), candidateId: candidate.candidateId, deterministicScore: candidate.deterministicScore })),
  };
}

interface AIProvider { rank(body: RequestBody, env: Env): Promise<unknown>; }
class CompatibleChatProvider implements AIProvider {
  async rank(body: RequestBody, env: Env): Promise<unknown> {
    const endpoint = new URL(env.AI_PROVIDER_URL);
    if (endpoint.protocol !== 'https:') throw new Error('Provider endpoint must use HTTPS');
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${env.AI_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ model: env.AI_MODEL, temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Rank only supplied real candidateId values by current music/session relevance, related artists, language compatibility when reliable, discovery and diversity. Preferences are soft; current intent wins. Return JSON {"tracks":[{"candidateId":"...","score":0.9}]}. Never invent IDs.' },
        { role: 'user', content: JSON.stringify(body) },
      ] }),
    });
    if (!response.ok) throw new Error('Provider request failed');
    const raw: unknown = await response.json();
    if (!isRecord(raw) || !Array.isArray(raw.choices) || !isRecord(raw.choices[0]) ||
        !isRecord(raw.choices[0].message) || typeof raw.choices[0].message.content !== 'string') throw new Error('Invalid provider response');
    return JSON.parse(raw.choices[0].message.content) as unknown;
  }
}
const provider: AIProvider = new CompatibleChatProvider();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/recommend') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const length = Number(request.headers.get('Content-Length'));
    if (length > MAX_BYTES) return new Response('Payload too large', { status: 413 });
    // A global edge-location budget caps unauthenticated provider spend without
    // penalizing many mobile users who share a carrier IP. Apply account-level
    // provider spending limits before deploying publicly as well.
    const { success } = await env.RECOMMEND_LIMIT.limit({ key: 'recommend' });
    if (!success) return new Response('Rate limited', { status: 429, headers: { 'Retry-After': '60' } });
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > MAX_BYTES) return new Response('Payload too large', { status: 413 });
    let body: unknown;
    try { body = JSON.parse(bodyText) as unknown; } catch { return new Response('Invalid JSON', { status: 400 }); }
    if (!validRequest(body)) return new Response('Invalid recommendation request', { status: 400 });
    if (!env.AI_API_KEY || !env.AI_PROVIDER_URL || !env.AI_MODEL) return new Response('Service unavailable', { status: 503 });
    try {
      const safeBody = sanitized(body);
      const ranked = validModelRanks(await provider.rank(safeBody, env), safeBody.candidates);
      if (!ranked) return new Response('Invalid ranking', { status: 502 });
      return new Response(JSON.stringify({ tracks: ranked }), { headers: JSON_HEADERS });
    } catch {
      // No provider details or request metadata are returned or logged.
      return new Response('Recommendation service unavailable', { status: 503 });
    }
  },
} satisfies ExportedHandler<Env>;
