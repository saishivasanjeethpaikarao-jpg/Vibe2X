import { describe, expect, it, vi } from 'vitest';
import { confirmLocalMutation } from '../confirmedMutation';

describe('confirmed local feedback', () => {
  it('announces only after mutation and persistence succeed', async () => {
    const events: string[] = [];
    const result = await confirmLocalMutation(
      () => events.push('mutated'),
      () => events.push('feedback'),
      async () => { events.push('saved'); return true; }
    );
    expect(result).toBe(true);
    expect(events).toEqual(['mutated', 'saved', 'feedback']);
  });

  it('does not show success when persistence fails', async () => {
    const feedback = vi.fn();
    const result = await confirmLocalMutation(vi.fn(), feedback, async () => false);
    expect(result).toBe(false);
    expect(feedback).not.toHaveBeenCalled();
  });
});
