import { describe, it, expect } from 'vitest';
import { calculateAttendanceStatus } from './attendanceRecorderService';

describe('calculateAttendanceStatus', () => {
  it('marks morning session on past date as late when scanned on the next day', () => {
    // Session is 2026-08-20 morning (cutoff was 2026-08-20 07:45 AM)
    // Scanned on 2026-08-21 00:33:00 (12:33 AM next day)
    const scanTime = new Date(2026, 7, 21, 0, 33, 0); // Month is 0-indexed: 7 = August
    const status = calculateAttendanceStatus('morning', '2026-08-20', scanTime);
    expect(status).toBe('late');
  });

  it('marks morning session on same day before 7:45 AM as present', () => {
    // Session is 2026-08-21 morning
    // Scanned at 2026-08-21 07:15:00
    const scanTime = new Date(2026, 7, 21, 7, 15, 0);
    const status = calculateAttendanceStatus('morning', '2026-08-21', scanTime);
    expect(status).toBe('present');
  });

  it('marks morning session on same day after 7:45 AM as late', () => {
    // Session is 2026-08-21 morning
    // Scanned at 2026-08-21 07:50:00
    const scanTime = new Date(2026, 7, 21, 7, 50, 0);
    const status = calculateAttendanceStatus('morning', '2026-08-21', scanTime);
    expect(status).toBe('late');
  });

  it('marks afternoon session before 1:15 PM as present', () => {
    // Session is 2026-08-21 afternoon (cutoff is 13:15:59)
    // Scanned at 2026-08-21 12:45:00
    const scanTime = new Date(2026, 7, 21, 12, 45, 0);
    const status = calculateAttendanceStatus('afternoon', '2026-08-21', scanTime);
    expect(status).toBe('present');
  });

  it('marks afternoon session after 1:15 PM as late', () => {
    // Session is 2026-08-21 afternoon
    // Scanned at 2026-08-21 13:30:00
    const scanTime = new Date(2026, 7, 21, 13, 30, 0);
    const status = calculateAttendanceStatus('afternoon', '2026-08-21', scanTime);
    expect(status).toBe('late');
  });
});
