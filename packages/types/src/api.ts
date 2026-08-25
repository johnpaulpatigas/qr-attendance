import { AttendanceRecord, AttendanceStatus, SessionType } from './attendance';

export interface RecordAttendancePayload {
  qr_payload: string; // e.g. "ATTENDANCE:<uuid>"
  class_id: string;
  session_id: string;
  attendance_date: string;
  session_type: SessionType;
  status?: AttendanceStatus; // Defaults to 'present' or calculated based on time
  recorded_by?: string;
  client_event_id?: string; // Idempotency key
}

export interface RecordAttendanceResponse {
  success: boolean;
  status: 'recorded' | 'already_recorded' | 'unauthorized' | 'invalid_qr' | 'not_enrolled' | 'queued_offline' | 'error';
  message: string;
  student?: {
    id: string;
    lrn: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
  };
  attendance?: AttendanceRecord;
}

export interface QueuedAttendanceScan {
  id: string; // client UUID (idempotency key / client_event_id)
  payload: RecordAttendancePayload;
  scanned_at: string; // ISO string
  student_name?: string;
  student_lrn?: string;
  retry_count: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  last_error?: string;
}

export interface OfflineSyncSummary {
  total: number;
  synced: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

export interface SF1ParsedStudent {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  suffix?: string | null;
  sex: 'MALE' | 'FEMALE';
  birth_date: string; // YYYY-MM-DD
  grade_level: number;
  section_name: string;
  school_year: string;
  isValid: boolean;
  errors: string[];
}

export interface SF1ImportSummary {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_lrns: number;
  created_students: number;
  updated_students: number;
  errors: Array<{ row: number; lrn?: string; message: string }>;
}
