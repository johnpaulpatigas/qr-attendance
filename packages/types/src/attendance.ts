export type SessionType = 'morning' | 'afternoon' | 'whole_day';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type AttendanceSource = 'qr_scan' | 'manual' | 'import' | 'correction';
export type AttendanceEventType =
  | 'scanned'
  | 'marked_present'
  | 'marked_late'
  | 'marked_absent'
  | 'marked_excused'
  | 'corrected'
  | 'deleted';

export interface AttendanceSession {
  id: string; // UUID
  class_id: string; // References class_sections.id
  teacher_id: string; // References profiles.id
  attendance_date: string; // YYYY-MM-DD
  session_type: SessionType;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string; // UUID
  student_id: string; // References students.id
  class_id: string; // References class_sections.id
  attendance_session_id: string; // References attendance_sessions.id
  attendance_date: string; // YYYY-MM-DD
  attendance_type: SessionType;
  status: AttendanceStatus;
  recorded_at: string;
  recorded_by: string; // References profiles.id (teacher/admin)
  source: AttendanceSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecordWithStudent extends AttendanceRecord {
  student?: {
    id: string;
    lrn: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
  };
}

export interface AttendanceEvent {
  id: string; // UUID
  attendance_id: string; // References attendance.id
  student_id: string; // References students.id
  teacher_id: string; // References profiles.id
  event_type: AttendanceEventType;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface AttendanceSummary {
  total_students: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  unrecorded_count: number;
}
