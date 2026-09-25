import { describe, expect, it } from 'vitest';
import { greetingForHour } from '../greeting';

describe('device-local greeting boundaries', () => {
  it.each([
    [0, 'Good night'], [4, 'Good night'],
    [5, 'Good morning'], [11, 'Good morning'],
    [12, 'Good afternoon'], [16, 'Good afternoon'],
    [17, 'Good evening'], [20, 'Good evening'],
    [21, 'Good night'], [23, 'Good night'],
  ])('hour %i gives %s', (hour, greeting) => {
    expect(greetingForHour(hour)).toBe(greeting);
  });
});
