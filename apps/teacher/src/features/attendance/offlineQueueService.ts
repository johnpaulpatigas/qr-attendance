import type {
  RecordAttendancePayload,
  RecordAttendanceResponse,
  QueuedAttendanceScan,
  OfflineSyncSummary,
} from '@qr-attendance/types';
import { parseQrPayload } from '@qr-attendance/validation';
import {
  getSupabaseClient,
  AppStorage,
  withNetworkTimeout,
  enqueueOfflineScan,
  removeQueuedOfflineScan,
  clearQueuedOfflineScans as clearSqliteQueue,
  saveCachedStudents,
  findCachedStudentByQr,
} from '@qr-attendance/supabase';
import { isNetworkOnline, onNetworkStatusChange } from './networkManager';

const QUEUE_STORAGE_KEY = 'mnhs_qr_attendance_offline_queue';
const ROSTER_CACHE_KEY_PREFIX = 'mnhs_qr_roster_cache_';
const MASTER_INDEX_KEY = 'mnhs_qr_master_students_index';

export interface CachedStudent {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  grade_level?: number;
  qr_identifier: string;
  section_id: string;
}

export function getQueuedScans(): QueuedAttendanceScan[] {
  try {
    const stored =
      AppStorage.getItem(QUEUE_STORAGE_KEY) ||
      AppStorage.getItem('deped_qr_attendance_offline_queue');
    if (!stored) return [];
    return JSON.parse(stored) as QueuedAttendanceScan[];
  } catch (err) {
    console.error('Failed to parse offline scans from storage:', err);
    return [];
  }
}

export function saveQueuedScans(scans: QueuedAttendanceScan[]): void {
  try {
    AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(scans));
    notifyQueueChange(scans.filter((s) => s.status === 'pending').length);
  } catch (err) {
    console.error('Failed to save offline scans to storage:', err);
  }
}

export function getQueuedCount(): number {
  return getQueuedScans().filter((s) => s.status === 'pending').length;
}

export function notifyQueueChange(count: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('attendance_offline_queue_changed', {
        detail: { count },
      })
    );
  }
}

export function onQueueChange(callback: (count: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<{ count: number }>;
    callback(customEvent.detail?.count ?? getQueuedCount());
  };

  window.addEventListener('attendance_offline_queue_changed', listener);
  return () => {
    window.removeEventListener('attendance_offline_queue_changed', listener);
  };
}

export function cacheClassRoster(classId: string, students: CachedStudent[]): void {
  if (!classId || !students || students.length === 0) return;
  try {
    // 1. Save specific class roster cache in storage
    AppStorage.setItem(`${ROSTER_CACHE_KEY_PREFIX}${classId}`, JSON.stringify(students));
    AppStorage.setItem(`teacher_cached_students_${classId}`, JSON.stringify(students));

    // 2. Keep a master lookup index for instant offline resolution
    const masterIndex = AppStorage.getJSON<Record<string, CachedStudent>>(MASTER_INDEX_KEY, {});
    students.forEach((s) => {
      if (s.qr_identifier) masterIndex[s.qr_identifier] = s;
      if (s.id) masterIndex[s.id] = s;
      if (s.lrn) masterIndex[s.lrn] = s;
    });
    AppStorage.setJSON(MASTER_INDEX_KEY, masterIndex);

    // 3. Persist into SQLite table in background
    saveCachedStudents(students).catch((err) => {
      console.warn('Background SQLite cache failed:', err);
    });
  } catch (err) {
    console.warn('Failed to cache class roster:', err);
  }
}

export function getCachedClassRoster(classId: string): CachedStudent[] {
  if (!classId) return [];
  try {
    const stored =
      AppStorage.getItem(`${ROSTER_CACHE_KEY_PREFIX}${classId}`) ||
      AppStorage.getItem(`teacher_cached_students_${classId}`) ||
      AppStorage.getItem(`deped_qr_roster_cache_${classId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function findCachedStudent(classId: string, rawQrPayload: string): CachedStudent | null {
  const parsed = parseQrPayload(rawQrPayload);
  const targetId = parsed.success && parsed.identifier ? parsed.identifier : rawQrPayload.replace(/^ATTENDANCE:/i, '').trim();
  if (!targetId) return null;

  // 1. Search specific class roster
  if (classId) {
    const roster = getCachedClassRoster(classId);
    const foundInClass = roster.find(
      (s) => s.qr_identifier === targetId || s.id === targetId || s.lrn === targetId
    );
    if (foundInClass) return foundInClass;
  }

  // 2. Search master student index
  try {
    const masterIndex = AppStorage.getJSON<Record<string, CachedStudent>>(MASTER_INDEX_KEY, {});
    if (masterIndex[targetId]) return masterIndex[targetId];
  } catch {
    // Ignore
  }

  // 3. Fallback: Search all keys starting with mnhs_qr_roster_cache_ or teacher_cached_students_
  try {
    const keys = AppStorage.findKeysStartingWith(ROSTER_CACHE_KEY_PREFIX).concat(
      AppStorage.findKeysStartingWith('teacher_cached_students_')
    );
    for (const key of keys) {
      const list = AppStorage.getJSON<CachedStudent[]>(key, []);
      const match = list.find(
        (s) => s.qr_identifier === targetId || s.id === targetId || s.lrn === targetId
      );
      if (match) return match;
    }
  } catch {
    // Ignore
  }

  return null;
}

export async function findCachedStudentAsync(
  classId: string,
  rawQrPayload: string
): Promise<CachedStudent | null> {
  const syncResult = findCachedStudent(classId, rawQrPayload);
  if (syncResult) return syncResult;

  const parsed = parseQrPayload(rawQrPayload);
  const targetId = parsed.success && parsed.identifier ? parsed.identifier : rawQrPayload.replace(/^ATTENDANCE:/i, '').trim();
  return findCachedStudentByQr(targetId, classId);
}

export function enqueueScan(
  payload: RecordAttendancePayload,
  studentInfo?: { name?: string; lrn?: string }
): QueuedAttendanceScan {
  const queue = getQueuedScans();

  // Check if identical student & session is already queued
  const existing = queue.find(
    (item) =>
      item.payload.session_id === payload.session_id &&
      (item.payload.qr_payload === payload.qr_payload ||
        (studentInfo?.lrn && item.student_lrn === studentInfo.lrn))
  );

  if (existing) {
    return existing;
  }

  const newScan: QueuedAttendanceScan = {
    id:
      payload.client_event_id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    payload: {
      ...payload,
      client_event_id:
        payload.client_event_id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    },
    scanned_at: new Date().toISOString(),
    student_name: studentInfo?.name,
    student_lrn: studentInfo?.lrn,
    retry_count: 0,
    status: 'pending',
  };

  queue.push(newScan);
  saveQueuedScans(queue);

  // Background persist to SQLite
  enqueueOfflineScan(newScan).catch((err) => {
    console.warn('Background SQLite enqueue failed:', err);
  });

  return newScan;
}

export function removeQueuedScan(id: string): void {
  const queue = getQueuedScans().filter((s) => s.id !== id);
  saveQueuedScans(queue);
  removeQueuedOfflineScan(id).catch(() => {});
}

export function clearQueuedScans(): void {
  saveQueuedScans([]);
  clearSqliteQueue().catch(() => {});
}

let isSyncInProgress = false;

/**
 * Synchronizes pending offline scans to Supabase.
 * Handles Edge Function calls and direct database fallback with timeout guards.
 */
export async function syncOfflineQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<OfflineSyncSummary> {
  if (isSyncInProgress) {
    const queue = getQueuedScans();
    const pendingScans = queue.filter((s) => s.status === 'pending');
    return {
      total: pendingScans.length,
      synced: 0,
      duplicates: 0,
      failed: 0,
      errors: ['Sync already in progress'],
    };
  }

  const queue = getQueuedScans();
  const pendingScans = queue.filter((s) => s.status === 'pending');
  const summary: OfflineSyncSummary = {
    total: pendingScans.length,
    synced: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  };

  if (pendingScans.length === 0) {
    return summary;
  }

  if (!isNetworkOnline()) {
    summary.errors.push('Device is currently offline.');
    return summary;
  }

  isSyncInProgress = true;
  const client = getSupabaseClient();
  const remainingQueue: QueuedAttendanceScan[] = queue.filter((s) => s.status !== 'pending');

  let currentAuthUserId: string | null = null;
  try {
    const { data: authData } = await client.auth.getUser();
    currentAuthUserId = authData?.user?.id || null;
  } catch {
    // Ignore
  }

  try {
    for (let i = 0; i < pendingScans.length; i++) {
      const item = pendingScans[i];
      item.status = 'syncing';

      try {
        let serverSessionId = item.payload.session_id;

        // 1. Resolve or create attendance_sessions record on server if missing or offline-generated
        if (!serverSessionId || serverSessionId.startsWith('offline_sess_')) {
          try {
            let sessionQuery = client
              .from('attendance_sessions')
              .select('id')
              .eq('class_id', item.payload.class_id)
              .eq('attendance_date', item.payload.attendance_date)
              .eq('session_type', item.payload.session_type);

            if (item.payload.subject_name) {
              sessionQuery = sessionQuery.eq('subject_name', item.payload.subject_name);
            } else {
              sessionQuery = sessionQuery.is('subject_name', null);
            }

            const { data: serverSession } = await withNetworkTimeout(
              sessionQuery.maybeSingle(),
              3500
            );

            if (serverSession) {
              serverSessionId = serverSession.id;
              item.payload.session_id = serverSession.id;
            } else {
              const teacherId =
                item.payload.recorded_by || currentAuthUserId || '00000000-0000-0000-0000-000000000000';
              const { data: newSess, error: sessErr } = await withNetworkTimeout(
                client
                  .from('attendance_sessions')
                  .insert({
                    class_id: item.payload.class_id,
                    teacher_id: teacherId,
                    attendance_date: item.payload.attendance_date,
                    session_type: item.payload.session_type,
                    subject_name: item.payload.subject_name || null,
                    started_at: item.scanned_at || new Date().toISOString(),
                  })
                  .select('id')
                  .single(),
                3500
              );

              if (!sessErr && newSess) {
                serverSessionId = newSess.id;
                item.payload.session_id = newSess.id;
              }
            }
          } catch (sessionErr) {
            console.warn('Session resolution network notice:', sessionErr);
          }
        }

        let isSynced = false;

        // 2. Try Edge Function record-attendance
        try {
          const { data, error } = await withNetworkTimeout(
            client.functions.invoke<RecordAttendanceResponse>('record-attendance', {
              body: item.payload,
            }),
            3500
          );

          if (!error && data) {
            if (data.status === 'recorded') {
              summary.synced++;
              isSynced = true;
            } else if (data.status === 'already_recorded') {
              summary.duplicates++;
              isSynced = true;
            } else if (!data.success) {
              summary.failed++;
              summary.errors.push(`${item.student_name || 'Student'}: ${data.message}`);
              item.status = 'failed';
              item.last_error = data.message;
              remainingQueue.push(item);
              continue;
            }
          }
        } catch {
          // Edge function unavailable, proceed to direct database insert
        }

        // 3. Direct database fallback if edge function was unavailable
        if (!isSynced) {
          const parsedQr = parseQrPayload(item.payload.qr_payload);
          const identifier =
            parsedQr.success && parsedQr.identifier
              ? parsedQr.identifier
              : item.payload.qr_payload.replace(/^ATTENDANCE:/i, '').trim();

          if (identifier) {
            const isUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
            let studentQuery = client
              .from('students')
              .select('id, section_id, lrn, first_name, last_name');

            if (isUuid) {
              studentQuery = studentQuery.or(`id.eq.${identifier},qr_identifier.eq.${identifier}`);
            } else {
              studentQuery = studentQuery.or(`qr_identifier.eq.${identifier},lrn.eq.${identifier}`);
            }

            const { data: studentData, error: stdErr } = await withNetworkTimeout(
              studentQuery.maybeSingle(),
              3500
            );

            const student = studentData as {
              id: string;
              section_id: string;
            } | null;

            if (student) {
              const { error: insertError } = await withNetworkTimeout(
                client.from('attendance').insert({
                  student_id: student.id,
                  class_id: item.payload.class_id || student.section_id,
                  attendance_session_id: serverSessionId,
                  attendance_date: item.payload.attendance_date,
                  attendance_type: item.payload.session_type,
                  subject_name: item.payload.subject_name || null,
                  status: item.payload.status || 'present',
                  recorded_by: item.payload.recorded_by || currentAuthUserId || '',
                  recorded_at: item.scanned_at,
                  source: 'qr_scan',
                }),
                3500
              );

              if (insertError) {
                if (insertError.code === '23505') {
                  summary.duplicates++;
                  isSynced = true;
                } else {
                  throw insertError;
                }
              } else {
                summary.synced++;
                isSynced = true;
              }
            } else if (stdErr) {
              throw stdErr;
            } else {
              // Student not found
              summary.failed++;
              summary.errors.push(`${item.student_name || 'Student'}: Student record not found on server.`);
              item.status = 'failed';
              item.last_error = 'Student record not found on server';
              remainingQueue.push(item);
              continue;
            }
          }
        }

        // Successfully synced or already recorded: clean up from SQLite and queue
        if (isSynced) {
          removeQueuedOfflineScan(item.id).catch(() => {});
        }

        if (onProgress) {
          onProgress(summary.synced + summary.duplicates + summary.failed, summary.total);
        }
      } catch (syncErr: unknown) {
        const errObj = syncErr as { message?: string };
        const isNetworkErr =
          !isNetworkOnline() ||
          errObj?.message?.includes('Failed to fetch') ||
          errObj?.message?.includes('NetworkError') ||
          errObj?.message?.includes('timed out');

        if (isNetworkErr) {
          item.status = 'pending';
          remainingQueue.push(item, ...pendingScans.slice(i + 1));
          summary.errors.push('Network connection interrupted. Paused sync queue.');
          break;
        }

        const msg = errObj?.message || 'Sync failed';
        item.status = 'failed';
        item.retry_count = (item.retry_count || 0) + 1;
        item.last_error = msg;
        remainingQueue.push(item);
        summary.failed++;
        summary.errors.push(`${item.student_name || 'Student'}: ${msg}`);
      }
    }
  } finally {
    isSyncInProgress = false;
    saveQueuedScans(remainingQueue);
  }

  return summary;
}

// Automatically trigger offline queue synchronization upon reconnection
if (typeof window !== 'undefined') {
  onNetworkStatusChange((online) => {
    if (online && getQueuedCount() > 0) {
      syncOfflineQueue().catch((err) => {
        console.warn('Auto-sync on network reconnect notice:', err);
      });
    }
  });
}
