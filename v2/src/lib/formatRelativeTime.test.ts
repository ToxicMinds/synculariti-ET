import { formatRelativeTime } from './utils';

describe('formatRelativeTime', () => {
  const now = Date.now();

  it('returns "just now" for timestamps less than 1 second ago', () => {
    const result = formatRelativeTime(new Date(now - 500).toISOString());
    expect(result).toMatch(/just now|now|0 seconds ago/);
  });

  it('returns seconds for timestamps less than 1 minute ago', () => {
    const result = formatRelativeTime(new Date(now - 30_000).toISOString());
    expect(result).toMatch(/30 seconds ago/);
  });

  it('returns minutes for timestamps less than 1 hour ago', () => {
    const result = formatRelativeTime(new Date(now - 5 * 60_000).toISOString());
    expect(result).toMatch(/5 minutes ago/);
  });

  it('returns hours for timestamps less than 24 hours ago', () => {
    const result = formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString());
    expect(result).toMatch(/3 hours ago/);
  });

  it('returns days for timestamps 24+ hours ago', () => {
    const result = formatRelativeTime(new Date(now - 2 * 86_400_000).toISOString());
    expect(result).toMatch(/2 days ago/);
  });

  it('handles edge boundary at exactly 60 seconds', () => {
    const result = formatRelativeTime(new Date(now - 60_000).toISOString());
    expect(result).toMatch(/1 minute ago|60 seconds ago/);
  });

  it('handles edge boundary at exactly 60 minutes', () => {
    const result = formatRelativeTime(new Date(now - 3_600_000).toISOString());
    expect(result).toMatch(/1 hour ago|60 minutes ago/);
  });

  it('handles edge boundary at exactly 24 hours (uses "yesterday" with numeric auto)', () => {
    const result = formatRelativeTime(new Date(now - 86_400_000).toISOString());
    expect(result).toMatch(/yesterday/);
  });

  it('handles future dates (returns "in N hours")', () => {
    const future = Date.now() + 4 * 3_600_000;
    const result = formatRelativeTime(new Date(future).toISOString());
    expect(result).toMatch(/in 4 hours/);
  });
});
