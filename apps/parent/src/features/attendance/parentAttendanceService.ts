import { getSupabaseClient } from '@qr-attendance/supabase';
import { getUtc8DateString } from '@qr-attendance/validation';
import type {
  AttendanceRecord,
  AttendanceStatus,
  NotificationLog,
} from '@qr-attendance/types';

export interface AttendanceRecordWithTeacher extends AttendanceRecord {
  teacher_name?: string | null;
}

export interface TodayStudentStatus {
  hasScannedToday: boolean;
  morningRecord: AttendanceRecordWithTeacher | null;
  afternoonRecord: AttendanceRecordWithTeacher | null;
  overallStatus: AttendanceStatus | 'unrecorded';
  lastRecordedAt: string | null;
  recordedByTeacherName: string | null;
}

export interface StudentAttendanceMetrics {
  total_school_days: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  excused_days: number;
  attendance_rate_percentage: number;
  tardiness_rate_percentage: number;
}

const CACHE_PREFIX = 'deped_parent_cache_';

export function getCachedItem<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

export function setCachedItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch (err) {
    console.warn('Failed to save parent cache:', err);
  }
}

export async function fetchTodayAttendance(
  studentId: string,
  dateStr?: string
): Promise<TodayStudentStatus> {
  const targetDate = dateStr || getUtc8DateString();
  const cacheKey = `today_${studentId}_${targetDate}`;

  // If offline, return immediately from cache if present
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getCachedItem<TodayStudentStatus>(cacheKey);
    if (cached) return cached;
  }

  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('attendance')
      .select(`
        *,
        profiles:recorded_by (
          full_name
        )
      `)
      .eq('student_id', studentId)
      .eq('attendance_date', targetDate);

    if (error) {
      const cached = getCachedItem<TodayStudentStatus>(cacheKey);
      if (cached) return cached;

      return {
        hasScannedToday: false,
        morningRecord: null,
        afternoonRecord: null,
        overallStatus: 'unrecorded',
        lastRecordedAt: null,
        recordedByTeacherName: null,
      };
    }

    if (!data || data.length === 0) {
      const defaultStatus: TodayStudentStatus = {
        hasScannedToday: false,
        morningRecord: null,
        afternoonRecord: null,
        overallStatus: 'unrecorded',
        lastRecordedAt: null,
        recordedByTeacherName: null,
      };
      setCachedItem(cacheKey, defaultStatus);
      return defaultStatus;
    }

    interface AttendanceJoinRow extends AttendanceRecord {
      profiles?: {
        full_name?: string;
      } | null;
    }

    const records: AttendanceRecordWithTeacher[] = (data as unknown as AttendanceJoinRow[]).map((r) => ({
      ...r,
      teacher_name: r.profiles?.full_name || 'Class Adviser',
    }));

    const morning = records.find((r) => r.attendance_type === 'morning') || null;
    const afternoon = records.find((r) => r.attendance_type === 'afternoon') || null;
    const primary = afternoon || morning;

    const result: TodayStudentStatus = {
      hasScannedToday: records.length > 0,
      morningRecord: morning,
      afternoonRecord: afternoon,
      overallStatus: primary ? primary.status : 'unrecorded',
      lastRecordedAt: primary ? primary.recorded_at : null,
      recordedByTeacherName: primary?.teacher_name || 'Class Adviser',
    };

    setCachedItem(cacheKey, result);
    return result;
  } catch {
    const cached = getCachedItem<TodayStudentStatus>(cacheKey);
    if (cached) return cached;

    return {
      hasScannedToday: false,
      morningRecord: null,
      afternoonRecord: null,
      overallStatus: 'unrecorded',
      lastRecordedAt: null,
      recordedByTeacherName: null,
    };
  }
}

export async function fetchAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const cacheKey = `history_${studentId}`;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getCachedItem<AttendanceRecord[]>(cacheKey);
    if (cached) return cached;
  }

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('attendance_date', { ascending: false });

    if (error || !data) {
      const cached = getCachedItem<AttendanceRecord[]>(cacheKey);
      return cached || [];
    }

    const records = data as unknown as AttendanceRecord[];
    setCachedItem(cacheKey, records);
    return records;
  } catch {
    const cached = getCachedItem<AttendanceRecord[]>(cacheKey);
    return cached || [];
  }
}

/**
 * Computes metrics by grouping session records into distinct calendar school days (DepEd SF2 format).
 */
export function computeStudentAttendanceMetrics(
  history: AttendanceRecord[]
): StudentAttendanceMetrics {
  // Group individual session records by unique calendar date (YYYY-MM-DD)
  const dateMap = new Map<string, AttendanceRecord[]>();

  for (const record of history) {
    const dateKey = record.attendance_date;
    const recordsForDate = dateMap.get(dateKey) || [];
    recordsForDate.push(record);
    dateMap.set(dateKey, recordsForDate);
  }

  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let excusedDays = 0;

  for (const records of dateMap.values()) {
    const statuses = records.map((r) => r.status);

    if (statuses.includes('absent')) {
      if (statuses.every((s) => s === 'absent')) {
        absentDays++;
      } else {
        // Partial day attendance (e.g. absent in one session, attended another) counts as late/tardy
        lateDays++;
      }
    } else if (statuses.includes('late')) {
      lateDays++;
    } else if (statuses.includes('excused')) {
      excusedDays++;
    } else if (statuses.includes('present')) {
      presentDays++;
    }
  }

  const totalDays = dateMap.size;
  const attendedDays = presentDays + lateDays;
  const attendanceRate =
    totalDays > 0 ? Number(((attendedDays / totalDays) * 100).toFixed(1)) : 0;
  const tardinessRate =
    totalDays > 0 ? Number(((lateDays / totalDays) * 100).toFixed(1)) : 0;

  return {
    total_school_days: totalDays,
    present_days: presentDays,
    late_days: lateDays,
    absent_days: absentDays,
    excused_days: excusedDays,
    attendance_rate_percentage: attendanceRate,
    tardiness_rate_percentage: tardinessRate,
  };
}

export async function fetchStudentStatistics(
  studentId: string
): Promise<StudentAttendanceMetrics> {
  const history = await fetchAttendanceHistory(studentId);
  return computeStudentAttendanceMetrics(history);
}

export async function fetchStudentNotificationLogs(
  studentId: string
): Promise<NotificationLog[]> {
  const cacheKey = `notifs_${studentId}`;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getCachedItem<NotificationLog[]>(cacheKey);
    if (cached) return cached;
  }

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('notification_logs')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      const cached = getCachedItem<NotificationLog[]>(cacheKey);
      return cached || [];
    }

    const logs = data as unknown as NotificationLog[];
    setCachedItem(cacheKey, logs);
    return logs;
  } catch {
    const cached = getCachedItem<NotificationLog[]>(cacheKey);
    return cached || [];
  }
}
