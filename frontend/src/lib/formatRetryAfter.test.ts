import { describe, it, expect } from 'vitest';
import { formatRetryAfter } from './formatRetryAfter';

describe('formatRetryAfter', () => {
  it('under a minute → "in a moment"', () => {
    expect(formatRetryAfter(0)).toBe('in a moment');
    expect(formatRetryAfter(59_000)).toBe('in a moment');
    expect(formatRetryAfter(-5_000)).toBe('in a moment'); // clamps negatives
  });

  it('minutes → "~Xm"', () => {
    expect(formatRetryAfter(60_000)).toBe('~1m');
    expect(formatRetryAfter(90_000)).toBe('~2m');
    expect(formatRetryAfter(5 * 60_000)).toBe('~5m');
    expect(formatRetryAfter(60 * 60_000)).toBe('~60m');
  });

  it('over an hour → "later today"', () => {
    expect(formatRetryAfter(61 * 60_000)).toBe('later today');
    expect(formatRetryAfter(5 * 60 * 60_000)).toBe('later today');
  });
});
