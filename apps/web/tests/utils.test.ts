import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSize, formatRelativeTime, formatDate, formatDuration, formatNumber } from '../src/lib/utils';

describe('formatSize', () => {
  it('formats zero bytes', () => expect(formatSize(0)).toBe('0 B'));
  it('formats bytes', () => expect(formatSize(512)).toBe('512 B'));
  it('formats kilobytes', () => expect(formatSize(2048)).toBe('2.0 KB'));
  it('formats megabytes', () => expect(formatSize(5242880)).toBe('5.0 MB'));
  it('formats gigabytes', () => expect(formatSize(1073741824)).toBe('1.00 GB'));
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns "never" for null', () => {
    expect(formatRelativeTime(null)).toBe('never');
    expect(formatRelativeTime(undefined)).toBe('never');
  });
  it('returns "just now" for recent', () => {
    expect(formatRelativeTime('2026-03-19T11:59:30.000Z')).toBe('just now');
  });
  it('returns minutes ago', () => {
    expect(formatRelativeTime('2026-03-19T11:55:00.000Z')).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-03-19T11:59:00.000Z')).toBe('1 minute ago');
  });
  it('returns hours ago', () => {
    expect(formatRelativeTime('2026-03-19T09:00:00.000Z')).toBe('3 hours ago');
  });
  it('returns days ago', () => {
    expect(formatRelativeTime('2026-03-17T12:00:00.000Z')).toBe('2 days ago');
  });
});

describe('formatDate', () => {
  it('returns -- for null', () => expect(formatDate(null)).toBe('--'));
  it('formats valid date', () => expect(formatDate('2026-03-19T00:00:00.000Z')).toContain('2026'));
});

describe('formatDuration', () => {
  it('formats milliseconds', () => expect(formatDuration(500)).toBe('500ms'));
  it('formats seconds', () => expect(formatDuration(3500)).toBe('3.5s'));
  it('formats minutes', () => expect(formatDuration(125000)).toBe('2m 5s'));
});

describe('formatNumber', () => {
  it('formats with commas', () => expect(formatNumber(1234567)).toBe('1,234,567'));
  it('formats small numbers', () => expect(formatNumber(42)).toBe('42'));
});
