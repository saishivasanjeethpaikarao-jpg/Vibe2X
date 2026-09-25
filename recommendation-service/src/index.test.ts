import { describe, expect, it, vi } from 'vitest';
import worker, { validModelRanks, validRequest } from './index';

const item = (id: string) => ({ id, title: `Song ${id}`, artist: 'Artist', album: '', duration: 180 });
const body = { current: item('current'), session: [], searchQuery: '', languages: [], favoriteArtists: [],
  likedArtists: [], skippedArtists: [], candidates: [{ ...item('candidate'), candidateId: 'candidate', deterministicScore: 12 }] };
const env = { AI_API_KEY: 'test-only', AI_PROVIDER_URL: 'https://example.test/chat/completions', AI_MODEL: 'fixture',
  RECOMMEND_LIMIT: { limit: async () => ({ success: true }) } };

describe('recommendation service boundary', () => {
  it('accepts compact music data and rejects extra or invalid candidate identities', () => {
    expect(validRequest(body)).toBe(true);
    expect(validRequest({ ...body, candidates: [{ ...body.candidates[0], candidateId: 'other' }] })).toBe(false);
    expect(validRequest({ ...body, candidates: [] })).toBe(false);
  });
  it('rejects hallucinated and repeated model IDs', () => {
    expect(validModelRanks({ tracks: [{ candidateId: 'candidate', score: 0.9 }] }, body.candidates)).toEqual([{ candidateId: 'candidate', score: 0.9 }]);
    expect(validModelRanks({ tracks: [{ candidateId: 'made-up', score: 0.9 }] }, body.candidates)).toBeNull();
    expect(validModelRanks({ tracks: [{ candidateId: 'candidate', score: 0.9 }, { candidateId: 'candidate', score: 0.8 }] }, body.candidates)).toBeNull();
  });
  it('rate limits before contacting the provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const limited = { ...env, RECOMMEND_LIMIT: { limit: async () => ({ success: false }) } };
    const response = await worker.fetch(new Request('https://example.test/recommend', { method: 'POST', body: JSON.stringify(body) }), limited);
    expect(response.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it('does not forward unexpected personal fields to the model', async () => {
    const providerFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ tracks: [{ candidateId: 'candidate', score: 0.8 }] }) } }],
    }), { status: 200 }));
    const withIdentity = { ...body, name: 'Private name', current: { ...body.current, email: 'private@example.test' } };
    const response = await worker.fetch(new Request('https://example.test/recommend', { method: 'POST', body: JSON.stringify(withIdentity) }), env);
    expect(response.status).toBe(200);
    const sent = providerFetch.mock.calls[0][1]?.body;
    expect(typeof sent).toBe('string');
    expect(sent).not.toContain('Private name');
    expect(sent).not.toContain('private@example.test');
    providerFetch.mockRestore();
  });
});
