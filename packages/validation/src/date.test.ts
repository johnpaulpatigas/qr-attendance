import { describe, it, expect } from 'vitest';
import { getUtc8DateString, getUtc8Time } from './date';

describe('UTC+8 Date & Time Utilities', () => {
  it('correctly calculates UTC+8 date for UTC timestamp near midnight', () => {
    // 2026-08-20 16:30:00 UTC is 2026-08-21 00:30:00 in UTC+8
    const utcDate = new Date('2026-08-20T16:30:00Z');
    const utc8DateStr = getUtc8DateString(utcDate);
    expect(utc8DateStr).toBe('2026-08-21');
  });

  it('correctly extracts hour and minute in UTC+8', () => {
    // 2026-08-20 23:45:00 UTC is 2026-08-21 07:45:00 in UTC+8
    const utcDate = new Date('2026-08-20T23:45:00Z');
    const time = getUtc8Time(utcDate);
    expect(time.hours).toBe(7);
    expect(time.minutes).toBe(45);
    expect(time.totalMinutes).toBe(465);
  });
});
