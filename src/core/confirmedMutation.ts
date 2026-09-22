import { flushWrites } from './storage';

/** Feedback is emitted only after the local write completed successfully. */
export async function confirmLocalMutation(
  mutate: () => void,
  onSaved: () => void,
  persist: () => Promise<boolean> = flushWrites
): Promise<boolean> {
  mutate();
  if (!(await persist())) return false;
  onSaved();
  return true;
}
