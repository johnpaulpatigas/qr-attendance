import { getSupabaseClient } from '@qr-attendance/supabase';
import type {
  AttendanceRecord,
  AttendanceStatus,
  NotificationLog,
} from '@qr-attendance/types';

export interface TodayStudentStatus {
  hasScannedToday: boolean;
  morningRecord: AttendanceRecord | null;
  afternoonRecord: AttendanceRecord | null;
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
  const targetDate = dateStr || new Date().toISOString().slice(0, 10);
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

    const records = data as any[];
    const morning = records.find((r) => r.attendance_type === 'morning') || null;
    const afternoon = records.find((r) => r.attendance_type === 'afternoon') || null;
    const primary = morning || afternoon;

    return {
      hasScannedToday: records.length > 0,
      morningRecord: morning,
      afternoonRecord: afternoon,
      overallStatus: primary ? primary.status : 'unrecorded',
      lastRecordedAt: primary ? primary.recorded_at : null,
      recordedByTeacherName: primary?.profiles?.full_name || 'Class Adviser',
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

export async function fetchStudentStatistics(
  studentId: string
): Promise<StudentAttendanceMetrics> {
  const history = await fetchAttendanceHistory(studentId);

  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  history.forEach((r) => {
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
    else if (r.status === 'excused') excused++;
  });

  const total = present + late + absent + excused;
  const attendanceRate = total > 0 ? Number((((present + late) / total) * 100).toFixed(1)) : 0;
  const tardinessRate = total > 0 ? Number(((late / total) * 100).toFixed(1)) : 0;

  return {
    total_school_days: total,
    present_days: present,
    late_days: late,
    absent_days: absent,
    excused_days: excused,
    attendance_rate_percentage: attendanceRate,
    tardiness_rate_percentage: tardinessRate,
  };
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
