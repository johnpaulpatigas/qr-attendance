import type { RecordAttendancePayload, RecordAttendanceResponse, QueuedAttendanceScan, OfflineSyncSummary } from "@qr-attendance/types";
import { parseQrPayload } from "@qr-attendance/validation";
import { getSupabaseClient } from "@qr-attendance/supabase";

const QUEUE_STORAGE_KEY = "deped_qr_attendance_offline_queue";
const ROSTER_CACHE_KEY_PREFIX = "deped_qr_roster_cache_";

export interface CachedStudent {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  qr_identifier: string;
  section_id: string;
}

export function getQueuedScans(): QueuedAttendanceScan[] {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as QueuedAttendanceScan[];
  } catch (err) {
    console.error("Failed to parse offline scans from localStorage:", err);
    return [];
  }
}

export function saveQueuedScans(scans: QueuedAttendanceScan[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(scans));
    notifyQueueChange(scans.filter((s) => s.status === "pending").length);
  } catch (err) {
    console.error("Failed to save offline scans to localStorage:", err);
  }
}

export function getQueuedCount(): number {
  return getQueuedScans().filter((s) => s.status === "pending").length;
}

export function notifyQueueChange(count: number): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("attendance_offline_queue_changed", { detail: { count } }));
  }
}

export function onQueueChange(callback: (count: number) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<{ count: number }>;
    callback(customEvent.detail?.count ?? getQueuedCount());
  };

  window.addEventListener("attendance_offline_queue_changed", listener);
  return () => {
    window.removeEventListener("attendance_offline_queue_changed", listener);
  };
}

export function cacheClassRoster(classId: string, students: CachedStudent[]): void {
  try {
    localStorage.setItem(`${ROSTER_CACHE_KEY_PREFIX}${classId}`, JSON.stringify(students));
    // Also keep a master lookup index for instant offline resolution
    const masterIndexStr = localStorage.getItem('deped_qr_master_students_index');
    const masterIndex: Record<string, CachedStudent> = masterIndexStr ? JSON.parse(masterIndexStr) : {};
    students.forEach((s) => {
      masterIndex[s.qr_identifier] = s;
      masterIndex[s.id] = s;
      masterIndex[s.lrn] = s;
    });
    localStorage.setItem('deped_qr_master_students_index', JSON.stringify(masterIndex));
  } catch (err) {
    console.warn("Failed to cache class roster:", err);
  }
}

export function getCachedClassRoster(classId: string): CachedStudent[] {
  try {
    const stored = localStorage.getItem(`${ROSTER_CACHE_KEY_PREFIX}${classId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function findCachedStudent(classId: string, rawQrPayload: string): CachedStudent | null {
  const parsed = parseQrPayload(rawQrPayload);
  if (!parsed.success || !parsed.identifier) return null;

  const targetId = parsed.identifier;

  // 1. Search specific class roster
  const roster = getCachedClassRoster(classId);
  const foundInClass = roster.find(
    (s) => s.qr_identifier === targetId || s.id === targetId || s.lrn === targetId
  );
  if (foundInClass) return foundInClass;

  // 2. Search master student index
  try {
    const masterIndexStr = localStorage.getItem('deped_qr_master_students_index');
    if (masterIndexStr) {
      const masterIndex = JSON.parse(masterIndexStr);
      if (masterIndex[targetId]) return masterIndex[targetId];
    }
  } catch {
    // Ignore
  }

  // 3. Fallback: Search all localStorage keys starting with deped_qr_roster_cache_
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ROSTER_CACHE_KEY_PREFIX)) {
        const listStr = localStorage.getItem(key);
        if (listStr) {
          const list = JSON.parse(listStr) as CachedStudent[];
          const match = list.find(
            (s) => s.qr_identifier === targetId || s.id === targetId || s.lrn === targetId
          );
          if (match) return match;
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
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
    id: payload.client_event_id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    payload: {
      ...payload,
      client_event_id: payload.client_event_id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    },
    scanned_at: new Date().toISOString(),
    student_name: studentInfo?.name,
    student_lrn: studentInfo?.lrn,
    retry_count: 0,
    status: "pending",
  };

  queue.push(newScan);
  saveQueuedScans(queue);
  return newScan;
}

export function removeQueuedScan(id: string): void {
  const queue = getQueuedScans().filter((s) => s.id !== id);
  saveQueuedScans(queue);
}

export function clearQueuedScans(): void {
  saveQueuedScans([]);
}

/**
 * Synchronizes pending offline scans to Supabase.
 * Handles Edge Function calls and direct database fallback.
 */
export async function syncOfflineQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<OfflineSyncSummary> {
  const queue = getQueuedScans();
  const pendingScans = queue.filter((s) => s.status === "pending");
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

  const client = getSupabaseClient();
  const remainingQueue: QueuedAttendanceScan[] = queue.filter((s) => s.status !== "pending");

  for (let i = 0; i < pendingScans.length; i++) {
    const item = pendingScans[i];
    item.status = "syncing";

    try {
      if (!item.payload.session_id || item.payload.session_id.startsWith("offline_sess_")) {
        try {
          const { data: serverSession } = await client
            .from("attendance_sessions")
            .select("id")
            .eq("class_id", item.payload.class_id)
            .eq("attendance_date", item.payload.attendance_date)
            .eq("session_type", item.payload.session_type)
            .maybeSingle();

          if (serverSession) {
            item.payload.session_id = serverSession.id;
          } else {
            const { data: newSess } = await client
              .from("attendance_sessions")
              .insert({
                class_id: item.payload.class_id,
                teacher_id: item.payload.recorded_by || '',
                attendance_date: item.payload.attendance_date,
                session_type: item.payload.session_type,
                started_at: item.scanned_at || new Date().toISOString(),
              })
              .select("id")
              .maybeSingle();
            if (newSess) item.payload.session_id = newSess.id;
          }
        } catch {
          // Session resolution network error
        }
      }

      const { data, error } = await client.functions.invoke<RecordAttendanceResponse>(
        "record-attendance",
        { body: item.payload }
      );

      if (!error && data) {
        if (data.status === "recorded") {
          summary.synced++;
        } else if (data.status === "already_recorded") {
          summary.duplicates++;
        } else if (!data.success) {
          summary.failed++;
          summary.errors.push(`${item.student_name || "Student"}: ${data.message}`);
          item.status = "failed";
          item.last_error = data.message;
          remainingQueue.push(item);
          continue;
        }
      } else {
        const parsedQr = parseQrPayload(item.payload.qr_payload);
        if (parsedQr.success && parsedQr.identifier) {
          const { data: studentData } = await client
            .from("students")
            .select("id, section_id")
            .or(`qr_identifier.eq.${parsedQr.identifier},id.eq.${parsedQr.identifier}`)
            .maybeSingle();

          const student = studentData as { id: string; section_id: string } | null;
          if (student) {
            const { error: insertError } = await client.from("attendance").insert({
              student_id: student.id,
              class_id: item.payload.class_id || student.section_id,
              attendance_session_id: item.payload.session_id,
              attendance_date: item.payload.attendance_date,
              attendance_type: item.payload.session_type,
              status: item.payload.status || "present",
              recorded_by: item.payload.recorded_by || '',
              recorded_at: item.scanned_at,
              source: "qr_scan",
            });

            if (insertError) {
              if (insertError.code === "23505") {
                summary.duplicates++;
              } else {
                throw insertError;
              }
            } else {
              summary.synced++;
            }
          }
        }
      }

      if (onProgress) {
        onProgress(summary.synced + summary.duplicates + summary.failed, summary.total);
      }
    } catch (syncErr: unknown) {
      const errObj = syncErr as { message?: string };
      const isNetworkError =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        errObj?.message?.includes("Failed to fetch") ||
        errObj?.message?.includes("NetworkError");

      if (isNetworkError) {
        item.status = "pending";
        remainingQueue.push(item, ...pendingScans.slice(i + 1));
        summary.errors.push("Network offline. Paused sync queue.");
        break;
      }

      const msg = errObj?.message || "Sync failed";
      item.status = "failed";
      item.retry_count = (item.retry_count || 0) + 1;
      item.last_error = msg;
      remainingQueue.push(item);
      summary.failed++;
      summary.errors.push(`${item.student_name || "Student"}: ${msg}`);
    }
  }

  saveQueuedScans(remainingQueue);
  return summary;
}
