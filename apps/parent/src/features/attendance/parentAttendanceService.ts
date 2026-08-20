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

export async function fetchTodayAttendance(
  studentId: string,
  dateStr?: string
): Promise<TodayStudentStatus> {
  const targetDate = dateStr || getUtc8DateString();
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

    if (error || !data || data.length === 0) {
      return {
        hasScannedToday: false,
        morningRecord: null,
        afternoonRecord: null,
        overallStatus: 'unrecorded',
        lastRecordedAt: null,
        recordedByTeacherName: null,
      };
    }

    const records = (data as any[]).map((r) => ({
      ...r,
      teacher_name: r.profiles?.full_name || 'Class Adviser',
    })) as AttendanceRecordWithTeacher[];

    const morning = records.find((r) => r.attendance_type === 'morning') || null;
    const afternoon = records.find((r) => r.attendance_type === 'afternoon') || null;
    // The latest record is considered primary for overall badge
    const primary = afternoon || morning;

    return {
      hasScannedToday: records.length > 0,
      morningRecord: morning,
      afternoonRecord: afternoon,
      overallStatus: primary ? primary.status : 'unrecorded',
      lastRecordedAt: primary ? primary.recorded_at : null,
      recordedByTeacherName: primary?.teacher_name || 'Class Adviser',
    };
  } catch {
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
  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('attendance_date', { ascending: false });

    if (error || !data) {
      return [];
    }
    return data as unknown as AttendanceRecord[];
  } catch {
    return [];
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
  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('notification_logs')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data as unknown as NotificationLog[];
  } catch {
    return [];
  }
}
