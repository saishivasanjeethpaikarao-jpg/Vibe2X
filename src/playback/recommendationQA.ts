/** Ephemeral, music-only diagnostics for QA builds. Never persisted or sent. */
export type RecommendationQA = {
  aiEnabled: boolean;
  endpointConfigured: boolean;
  aiRequestSent: boolean;
  responseReceived: boolean;
  responseValid: boolean;
  aiOrderingApplied: boolean;
  fallbackUsed: boolean;
  fallbackReason: string;
  candidateCount: number;
  filteredCandidateCount: number;
  hardFilterRemovals: number;
  aiLatencyMs: number | null;
  selected: { trackId: string; title: string; sourceCandidateType: string[]; language: string; reasons: string[]; aiRank: number | null }[];
};

export const recommendationQAEnabled = process.env.EXPO_PUBLIC_QA_RECOMMENDATIONS === 'true';
let last: RecommendationQA | null = null;
const listeners = new Set<() => void>();

export function publishRecommendationQA(value: RecommendationQA): void {
  if (!recommendationQAEnabled) return;
  last = value;
  console.info('[Vibe2X recommendation QA]', value);
  listeners.forEach((listener) => listener());
}

export function getRecommendationQA(): RecommendationQA | null { return last; }

export function subscribeRecommendationQA(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
