import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOfflineScan,
  getQueuedOfflineScans,
  removeQueuedOfflineScan,
  clearQueuedOfflineScans,
  saveCachedStudents,
  findCachedStudentByQr,
  saveCachedSections,
  getCachedSections,
  saveCachedSession,
  saveCachedRecords,
  getCachedRecords,
} from './offlineDb';
import { AppStorage } from './storage';
import type { QueuedAttendanceScan, ClassSectionWithDetails, AttendanceSession } from '@qr-attendance/types';

describe('Offline Database (SQLite & Multi-Tier Fallback)', () => {
  beforeEach(() => {
    AppStorage.clear();
  });

  it('enqueues and retrieves offline scans', async () => {
    const scan: QueuedAttendanceScan = {
      id: 'scan-1',
      payload: {
        client_event_id: 'evt-1',
        class_id: 'class-1',
        session_id: 'sess-1',
        attendance_date: '2026-08-25',
        session_type: 'morning',
        qr_payload: 'ATTENDANCE:std-uuid-1',
      },
      scanned_at: new Date().toISOString(),
      student_name: 'Juan Dela Cruz',
      student_lrn: '123456789012',
      retry_count: 0,
      status: 'pending',
    };

    await enqueueOfflineScan(scan);
    const queue = await getQueuedOfflineScans();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe('scan-1');
    expect(queue[0].student_name).toBe('Juan Dela Cruz');

    await removeQueuedOfflineScan('scan-1');
    const emptyQueue = await getQueuedOfflineScans();
    expect(emptyQueue.length).toBe(0);
  });

  it('clears all queued scans', async () => {
    const scan: QueuedAttendanceScan = {
      id: 'scan-2',
      payload: {
        client_event_id: 'evt-2',
        class_id: 'class-1',
        session_id: 'sess-1',
        attendance_date: '2026-08-25',
        session_type: 'morning',
        qr_payload: 'ATTENDANCE:std-uuid-2',
      },
      scanned_at: new Date().toISOString(),
      student_name: 'Maria Clara',
      retry_count: 0,
      status: 'pending',
    };

    await enqueueOfflineScan(scan);
    await clearQueuedOfflineScans();
    const queue = await getQueuedOfflineScans();
    expect(queue.length).toBe(0);
  });

  it('caches student roster and looks up by QR identifier or raw payload', async () => {
    const student = {
      id: 'std-uuid-100',
      lrn: '123456789099',
      first_name: 'Crisostomo',
      last_name: 'Ibarra',
      middle_name: 'M',
      suffix: null,
      qr_identifier: 'ibarra-qr-id',
      section_id: 'class-10',
    };

    await saveCachedStudents([student]);

    const foundByQr = await findCachedStudentByQr('ibarra-qr-id', 'class-10');
    expect(foundByQr).not.toBeNull();
    expect(foundByQr?.first_name).toBe('Crisostomo');

    const foundByRaw = await findCachedStudentByQr('ATTENDANCE:ibarra-qr-id');
    expect(foundByRaw).not.toBeNull();
    expect(foundByRaw?.last_name).toBe('Ibarra');

    const notFound = await findCachedStudentByQr('unknown-qr-xyz');
    expect(notFound).toBeNull();
  });

  it('caches class sections and retrieves them correctly', async () => {
    const sections: ClassSectionWithDetails[] = [
      {
        id: 'sec-1',
        grade_level: 10,
        section_name: 'Rizal',
        room_number: 'Room 101',
        school_year_id: 'sy-1',
        school_year_name: '2026-2027',
        teacher_id: 'teacher-1',
        adviser_id: 'teacher-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        student_count: 45,
        subject_teachers: [],
      },
    ];

    await saveCachedSections(sections);
    const retrieved = await getCachedSections();
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].section_name).toBe('Rizal');
    expect(retrieved[0].student_count).toBe(45);
  });

  it('caches attendance sessions and session records', async () => {
    const session: AttendanceSession = {
      id: 'sess-test-1',
      class_id: 'class-1',
      teacher_id: 'teacher-1',
      attendance_date: '2026-08-25',
      session_type: 'morning',
      subject_name: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
    };

    await saveCachedSession(session);

    const records = [
      {
        id: 'rec-1',
        student_id: 'std-uuid-100',
        class_id: 'class-1',
        attendance_session_id: 'sess-test-1',
        attendance_date: '2026-08-25',
        attendance_type: 'morning' as const,
        status: 'present' as const,
        recorded_by: 'teacher-1',
        recorded_at: new Date().toISOString(),
        source: 'qr_scan' as const,
      },
    ];

    await saveCachedRecords('sess-test-1', records);
    const retrievedRecords = await getCachedRecords('sess-test-1');
    expect(retrievedRecords.length).toBe(1);
    expect(retrievedRecords[0].id).toBe('rec-1');
  });
});
