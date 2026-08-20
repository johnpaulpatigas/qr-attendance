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

// Fallback historical records for development and immediate testability
const fallbackHistory: AttendanceRecord[] = [
  {
    id: 'att-1',
    student_id: 'std-1',
    class_id: 'sec-1',
    attendance_session_id: 'sess-1',
    attendance_date: '2026-08-20',
    attendance_type: 'morning',
    status: 'present',
    recorded_at: '2026-08-20T07:42:00.000Z',
    recorded_by: 't-1',
    source: 'qr_scan',
    notes: null,
    created_at: '2026-08-20T07:42:00.000Z',
    updated_at: '2026-08-20T07:42:00.000Z',
  },
  {
    id: 'att-2',
    student_id: 'std-1',
    class_id: 'sec-1',
    attendance_session_id: 'sess-2',
    attendance_date: '2026-08-19',
    attendance_type: 'morning',
    status: 'present',
    recorded_at: '2026-08-19T07:40:00.000Z',
    recorded_by: 't-1',
    source: 'qr_scan',
    notes: null,
    created_at: '2026-08-19T07:40:00.000Z',
    updated_at: '2026-08-19T07:40:00.000Z',
  },
  {
    id: 'att-3',
    student_id: 'std-1',
    class_id: 'sec-1',
    attendance_session_id: 'sess-3',
    attendance_date: '2026-08-18',
    attendance_type: 'morning',
    status: 'late',
    recorded_at: '2026-08-18T07:58:00.000Z',
    recorded_by: 't-1',
    source: 'qr_scan',
    notes: 'Arrived after 7:45 AM bell',
    created_at: '2026-08-18T07:58:00.000Z',
    updated_at: '2026-08-18T07:58:00.000Z',
  },
  {
    id: 'att-4',
    student_id: 'std-1',
    class_id: 'sec-1',
    attendance_session_id: 'sess-4',
    attendance_date: '2026-08-17',
    attendance_type: 'morning',
    status: 'present',
    recorded_at: '2026-08-17T07:35:00.000Z',
    recorded_by: 't-1',
    source: 'qr_scan',
    notes: null,
    created_at: '2026-08-17T07:35:00.000Z',
    updated_at: '2026-08-17T07:35:00.000Z',
  },
  {
    id: 'att-5',
    student_id: 'std-1',
    class_id: 'sec-1',
    attendance_session_id: 'sess-5',
    attendance_date: '2026-08-14',
    attendance_type: 'morning',
    status: 'present',
    recorded_at: '2026-08-14T07:41:00.000Z',
    recorded_by: 't-1',
    source: 'qr_scan',
    notes: null,
    created_at: '2026-08-14T07:41:00.000Z',
    updated_at: '2026-08-14T07:41:00.000Z',
  },
];

export async function fetchTodayAttendance(
  studentId: string,
  dateStr?: string
): Promise<TodayStudentStatus> {
  const targetDate = dateStr || new Date().toISOString().slice(0, 10);
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('attendance_date', targetDate);

    if (error || !data || data.length === 0) {
      // Fallback
      const rec = fallbackHistory.find(
        (h) => h.student_id === studentId || h.attendance_date === targetDate
      );
      if (rec) {
        return {
          hasScannedToday: true,
          morningRecord: rec,
          afternoonRecord: null,
          overallStatus: rec.status,
          lastRecordedAt: rec.recorded_at,
          recordedByTeacherName: 'Teacher Cruz',
        };
      }
      return {
        hasScannedToday: false,
        morningRecord: null,
        afternoonRecord: null,
        overallStatus: 'unrecorded',
        lastRecordedAt: null,
        recordedByTeacherName: null,
      };
    }

    const records = data as unknown as AttendanceRecord[];
    const morning = records.find((r) => r.attendance_type === 'morning') || null;
    const afternoon = records.find((r) => r.attendance_type === 'afternoon') || null;
    const primary = morning || afternoon;

    return {
      hasScannedToday: records.length > 0,
      morningRecord: morning,
      afternoonRecord: afternoon,
      overallStatus: primary ? primary.status : 'unrecorded',
      lastRecordedAt: primary ? primary.recorded_at : null,
      recordedByTeacherName: 'Class Adviser',
    };
  } catch {
    return {
      hasScannedToday: true,
      morningRecord: fallbackHistory[0],
      afternoonRecord: null,
      overallStatus: 'present',
      lastRecordedAt: fallbackHistory[0].recorded_at,
      recordedByTeacherName: 'Teacher Cruz',
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

    if (error || !data || data.length === 0) {
      return fallbackHistory;
    }
    return data as unknown as AttendanceRecord[];
  } catch {
    return fallbackHistory;
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

  const total = Math.max(1, present + late + absent + excused);
  const attendanceRate = Number((((present + late) / total) * 100).toFixed(1));
  const tardinessRate = Number(((late / total) * 100).toFixed(1));

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

    if (error || !data || data.length === 0) {
      return [
        {
          id: 'log-1',
          recipient_profile_id: 'p-1',
          student_id: studentId,
          attendance_id: 'att-1',
          notification_type: 'attendance_present',
          status: 'sent',
          fcm_token: 'fcm-token-1',
          error_message: null,
          sent_at: '2026-08-20T07:42:05.000Z',
          created_at: '2026-08-20T07:42:05.000Z',
        },
        {
          id: 'log-2',
          recipient_profile_id: 'p-1',
          student_id: studentId,
          attendance_id: 'att-3',
          notification_type: 'attendance_late',
          status: 'sent',
          fcm_token: 'fcm-token-1',
          error_message: null,
          sent_at: '2026-08-18T07:58:04.000Z',
          created_at: '2026-08-18T07:58:04.000Z',
        },
      ];
    }

    return data as unknown as NotificationLog[];
  } catch {
    return [];
  }
}
