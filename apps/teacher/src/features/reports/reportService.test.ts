import { describe, it, expect } from 'vitest';
import { generateSF2Report } from './reportService';

describe('Monthly Attendance Register Report Service', () => {
  it('correctly calculates school days (excluding Saturdays and Sundays) for a given month', async () => {
    // August 2026 has 31 days. August 1 is Saturday, August 2 is Sunday.
    // 31 days - 9 weekend days (1, 2, 8, 9, 15, 16, 22, 23, 29, 30) = 21 school days
    const report = await generateSF2Report('test-class-id', 2026, 8);
    expect(report.monthName).toBe('August');
    expect(report.year).toBe(2026);
    expect(report.schoolDays.length).toBe(21);
    expect(report.schoolDays).not.toContain(1); // Saturday
    expect(report.schoolDays).not.toContain(2); // Sunday
    expect(report.schoolDays).toContain(3); // Monday
  });

  it('correctly formats school institutional metadata for Marigondon National High School', async () => {
    const report = await generateSF2Report('test-class-id', 2026, 8);
    expect(report.schoolName).toBe('Marigondon National High School');
    expect(report.schoolId).toBe('303180');
    expect(report.division).toBe('SDO Lapu-Lapu City');
    expect(report.region).toContain('Region VII');
  });
});
