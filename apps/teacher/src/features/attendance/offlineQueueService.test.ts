import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getQueuedScans,
  enqueueScan,
  removeQueuedScan,
  clearQueuedScans,
  getQueuedCount,
  cacheClassRoster,
  findCachedStudent,
  syncOfflineQueue,
} from './offlineQueueService';
import type { RecordAttendancePayload } from '@qr-attendance/types';

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

describe('Offline Attendance Queue Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const samplePayload: RecordAttendancePayload = {
    qr_payload: 'ATTENDANCE:7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
    class_id: 'class-123',
    session_id: 'sess-456',
    attendance_date: '2026-08-25',
    session_type: 'morning',
    status: 'present',
  };

  it('enqueues a scan and retrieves it properly', () => {
    expect(getQueuedCount()).toBe(0);

    const queued = enqueueScan(samplePayload, {
      name: 'Juan Dela Cruz',
      lrn: '123456789012',
    });

    expect(queued).toBeDefined();
    expect(queued.status).toBe('pending');
    expect(queued.student_name).toBe('Juan Dela Cruz');
    expect(queued.student_lrn).toBe('123456789012');
    expect(queued.payload.client_event_id).toBeDefined();
    expect(getQueuedCount()).toBe(1);

    const all = getQueuedScans();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(queued.id);
  });

  it('prevents duplicate scan entries for the same student and session in the queue', () => {
    enqueueScan(samplePayload, { name: 'Juan Dela Cruz', lrn: '123456789012' });
    enqueueScan(samplePayload, { name: 'Juan Dela Cruz', lrn: '123456789012' });

    expect(getQueuedCount()).toBe(1);
  });

  it('removes a queued scan by id', () => {
    const queued1 = enqueueScan(samplePayload, { name: 'Juan Dela Cruz' });
    const payload2: RecordAttendancePayload = {
      ...samplePayload,
      qr_payload: 'ATTENDANCE:another-uuid-here',
    };
    const queued2 = enqueueScan(payload2, { name: 'Maria Santos' });

    expect(getQueuedCount()).toBe(2);

    removeQueuedScan(queued1.id);
    expect(getQueuedCount()).toBe(1);

    const remaining = getQueuedScans();
    expect(remaining[0].id).toBe(queued2.id);
  });

  it('clears the entire offline queue', () => {
    enqueueScan(samplePayload);
    expect(getQueuedCount()).toBe(1);

    clearQueuedScans();
    expect(getQueuedCount()).toBe(0);
    expect(getQueuedScans().length).toBe(0);
  });

  it('caches class roster and looks up student by QR payload or identifier', () => {
    const students = [
      {
        id: 'student-uuid-1',
        lrn: '123456789012',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        middle_name: 'Perez',
        suffix: null,
        qr_identifier: '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
        section_id: 'class-123',
      },
    ];

    cacheClassRoster('class-123', students);

    const found = findCachedStudent('class-123', 'ATTENDANCE:7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c');
    expect(found).toBeDefined();
    expect(found?.first_name).toBe('Juan');
    expect(found?.lrn).toBe('123456789012');

    const notFound = findCachedStudent('class-123', 'ATTENDANCE:unknown-identifier');
    expect(notFound).toBeNull();
  });

  it('syncOfflineQueue returns empty summary when queue is empty', async () => {
    const summary = await syncOfflineQueue();
    expect(summary.total).toBe(0);
    expect(summary.synced).toBe(0);
    expect(summary.failed).toBe(0);
  });
});
