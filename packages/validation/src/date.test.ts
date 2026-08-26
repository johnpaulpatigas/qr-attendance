import { describe, it, expect } from 'vitest';
import { getUtc8DateString, getUtc8Time, parseFlexibleDate } from './date';

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

  it('parses ISO date strings into YYYY-MM-DD format', () => {
    const res = parseFlexibleDate('2008-11-24');
    expect(res.success).toBe(true);
    expect(res.dateString).toBe('2008-11-24');
  });

  it('parses Excel numeric serial date numbers', () => {
    // Excel serial 39448 corresponds to 2008-01-01
    const res = parseFlexibleDate(39448);
    expect(res.success).toBe(true);
    expect(res.dateString).toBe('2008-01-01');

    const strRes = parseFlexibleDate('39448');
    expect(strRes.success).toBe(true);
    expect(strRes.dateString).toBe('2008-01-01');
  });

  it('parses Philippine slash date strings (MM/DD/YYYY and DD/MM/YYYY)', () => {
    const res1 = parseFlexibleDate('05/12/2008');
    expect(res1.success).toBe(true);
    expect(res1.dateString).toBe('2008-05-12');

    const res2 = parseFlexibleDate('25/12/2008'); // Day > 12 -> DD/MM/YYYY
    expect(res2.success).toBe(true);
    expect(res2.dateString).toBe('2008-12-25');
  });

  it('parses native Date instances correctly', () => {
    const d = new Date(Date.UTC(2008, 4, 15));
    const res = parseFlexibleDate(d);
    expect(res.success).toBe(true);
    expect(res.dateString).toBe('2008-05-15');
  });

  it('returns explicit error for invalid date inputs', () => {
    expect(parseFlexibleDate('').success).toBe(false);
    expect(parseFlexibleDate(null).success).toBe(false);
    expect(parseFlexibleDate('not-a-date').success).toBe(false);
  });
});
