import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeStudentAttendanceMetrics,
  getCachedItem,
  setCachedItem,
} from './parentAttendanceService';
import type { AttendanceRecord } from '@qr-attendance/types';

const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const storageMock = createStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
});

describe('parentAttendanceService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('computeStudentAttendanceMetrics', () => {
    it('correctly groups 4 session scans across 2 distinct calendar days into 2 total school days', () => {
      const mockRecords: AttendanceRecord[] = [
        {
          id: '1',
          student_id: 's1',
          class_id: 'c1',
          attendance_session_id: 'sess1',
          attendance_date: '2026-08-20',
          attendance_type: 'morning',
          status: 'present',
          recorded_at: '2026-08-20T07:15:00Z',
          recorded_by: 't1',
          source: 'qr_scan',
          notes: null,
          created_at: '2026-08-20T07:15:00Z',
          updated_at: '2026-08-20T07:15:00Z',
        },
        {
          id: '2',
          student_id: 's1',
          class_id: 'c1',
          attendance_session_id: 'sess2',
          attendance_date: '2026-08-20',
          attendance_type: 'afternoon',
          status: 'present',
          recorded_at: '2026-08-20T12:45:00Z',
          recorded_by: 't1',
          source: 'qr_scan',
          notes: null,
          created_at: '2026-08-20T12:45:00Z',
          updated_at: '2026-08-20T12:45:00Z',
        },
        {
          id: '3',
          student_id: 's1',
          class_id: 'c1',
          attendance_session_id: 'sess3',
          attendance_date: '2026-08-21',
          attendance_type: 'morning',
          status: 'late',
          recorded_at: '2026-08-21T07:50:00Z',
          recorded_by: 't1',
          source: 'qr_scan',
          notes: null,
          created_at: '2026-08-21T07:50:00Z',
          updated_at: '2026-08-21T07:50:00Z',
        },
        {
          id: '4',
          student_id: 's1',
          class_id: 'c1',
          attendance_session_id: 'sess4',
          attendance_date: '2026-08-21',
          attendance_type: 'afternoon',
          status: 'present',
          recorded_at: '2026-08-21T12:50:00Z',
          recorded_by: 't1',
          source: 'qr_scan',
          notes: null,
          created_at: '2026-08-21T12:50:00Z',
          updated_at: '2026-08-21T12:50:00Z',
        },
      ];

      const metrics = computeStudentAttendanceMetrics(mockRecords);

      expect(metrics.total_school_days).toBe(2);
      expect(metrics.present_days).toBe(1);
      expect(metrics.late_days).toBe(1);
      expect(metrics.absent_days).toBe(0);
      expect(metrics.attendance_rate_percentage).toBe(100);
      expect(metrics.tardiness_rate_percentage).toBe(50);
    });

    it('returns 0 for empty attendance history', () => {
      const metrics = computeStudentAttendanceMetrics([]);
      expect(metrics.total_school_days).toBe(0);
      expect(metrics.attendance_rate_percentage).toBe(0);
    });
  });

  describe('offline caching', () => {
    it('sets and gets cached items properly', () => {
      expect(getCachedItem('sample_key')).toBeNull();

      const sampleData = { status: 'present', count: 5 };
      setCachedItem('sample_key', sampleData);

      const retrieved = getCachedItem<typeof sampleData>('sample_key');
      expect(retrieved).toEqual(sampleData);
    });
  });
});
