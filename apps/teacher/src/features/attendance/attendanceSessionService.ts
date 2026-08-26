import { getSupabaseClient } from '@qr-attendance/supabase';
import type {
  AttendanceSession,
  AttendanceSummary,
  AttendanceRecord,
  AttendanceRecordWithStudent,
  ClassSectionWithDetails,
  SessionType,
} from '@qr-attendance/types';
import { getCachedClassRoster, getQueuedScans } from './offlineQueueService';

const SECTIONS_CACHE_KEY = 'teacher_cached_sections';
const SESSION_CACHE_PREFIX = 'teacher_cached_session_';
const RECORDS_CACHE_PREFIX = 'teacher_cached_records_';

export async function fetchClassSections(): Promise<ClassSectionWithDetails[]> {
  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('class_sections')
      .select(`
        *,
        school_years (
          name
        ),
        students (
          id
        )
      `)
      .order('grade_level', { ascending: false });

    if (!error && data && data.length > 0) {
      interface SectionJoinRow {
        id: string;
        grade_level: number;
        section_name: string;
        room_number: string | null;
        school_year_id: string;
        teacher_id: string | null;
        created_at: string;
        updated_at: string;
        school_years?: { name: string } | null;
        students?: { id: string }[] | null;
      }

      const sections: ClassSectionWithDetails[] = (data as unknown as SectionJoinRow[]).map((d) => ({
        id: d.id,
        grade_level: d.grade_level,
        section_name: d.section_name,
        room_number: d.room_number,
        school_year_id: d.school_year_id,
        teacher_id: d.teacher_id,
        created_at: d.created_at,
        updated_at: d.updated_at,
        school_year_name: d.school_years?.name || 'Active SY',
        student_count: Array.isArray(d.students) ? d.students.length : 0,
      }));

      try {
        localStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify(sections));
      } catch {
        // Storage write ignored
      }

      return sections;
    }
  } catch {
    // Fall back to local storage cache if offline
  }

  try {
    const cached = localStorage.getItem(SECTIONS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as ClassSectionWithDetails[];
  } catch {
    // Storage read ignored
  }

  return [];
}

export async function getOrCreateAttendanceSession(
  classId: string,
  attendanceDate: string,
  sessionType: SessionType,
  teacherId: string
): Promise<AttendanceSession> {
  const client = getSupabaseClient();
  const cacheKey = `${SESSION_CACHE_PREFIX}${classId}_${attendanceDate}_${sessionType}`;

  try {
    const { data: existing, error: findError } = await client
      .from('attendance_sessions')
      .select('*')
      .eq('class_id', classId)
      .eq('attendance_date', attendanceDate)
      .eq('session_type', sessionType)
      .maybeSingle();

    if (!findError && existing) {
      const session = existing;
      localStorage.setItem(cacheKey, JSON.stringify(session));
      return session;
    }

    const newSession = {
      class_id: classId,
      teacher_id: teacherId,
      attendance_date: attendanceDate,
      session_type: sessionType,
      started_at: new Date().toISOString(),
    };

    const { data: created, error: createError } = await client
      .from('attendance_sessions')
      .insert(newSession)
      .select()
      .maybeSingle();

    if (!createError && created) {
      const session = created;
      localStorage.setItem(cacheKey, JSON.stringify(session));
      return session;
    }
  } catch {
    // Network offline fallback
  }

  // Offline fallback: check local cache or construct offline session object
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as AttendanceSession;
  } catch {
    // Ignore
  }

  const offlineSession: AttendanceSession = {
    id: `offline_sess_${classId}_${attendanceDate}_${sessionType}`,
    class_id: classId,
    teacher_id: teacherId,
    attendance_date: attendanceDate,
    session_type: sessionType,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify(offlineSession));
  } catch {
    // Ignore
  }

  return offlineSession;
}

export async function fetchSessionRecords(
  sessionId: string
): Promise<AttendanceRecordWithStudent[]> {
  const client = getSupabaseClient();
  const cacheKey = `${RECORDS_CACHE_PREFIX}${sessionId}`;

  try {
    const { data, error } = await client
      .from('attendance')
      .select(`
        *,
        students (
          id,
          lrn,
          first_name,
          last_name,
          middle_name,
          suffix
        )
      `)
      .eq('attendance_session_id', sessionId)
      .order('recorded_at', { ascending: false });

    if (!error && data) {
      interface AttendanceRecordJoinRow extends AttendanceRecord {
        students?: {
          id: string;
          lrn: string;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          suffix: string | null;
        } | null;
      }

      const records: AttendanceRecordWithStudent[] = (data as unknown as AttendanceRecordJoinRow[]).map((d) => ({
        ...d,
        student: d.students || undefined,
      }));

      try {
        localStorage.setItem(cacheKey, JSON.stringify(records));
      } catch {
        // Storage write ignored
      }

      return records;
    }
  } catch {
    // Fall back to local storage cache if offline
  }

  try {
    const cached = localStorage.getItem(cacheKey);
    return cached ? (JSON.parse(cached) as AttendanceRecordWithStudent[]) : [];
  } catch {
    return [];
  }
}

export async function fetchAttendanceSummary(
  sessionId: string,
  classId: string
): Promise<AttendanceSummary> {
  const client = getSupabaseClient();
  const records = await fetchSessionRecords(sessionId);

  // Include any pending offline scans for this session
  const queuedScans = getQueuedScans().filter(
    (s) => s.payload.session_id === sessionId || s.payload.class_id === classId
  );

  let present = 0;
  let late = 0;
  let absent = 0;

  const recordedStudentIds = new Set<string>();

  records.forEach((r) => {
    recordedStudentIds.add(r.student_id);
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
  });

  queuedScans.forEach((q) => {
    const studentId = q.payload.qr_payload;
    if (!recordedStudentIds.has(studentId)) {
      recordedStudentIds.add(studentId);
      if (q.payload.status === 'late') late++;
      else present++;
    }
  });

  // Query actual student count for class section
  let total = 0;
  try {
    const { count, error } = await client
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('section_id', classId);

    if (!error && typeof count === 'number') {
      total = count;
    }
  } catch {
    // If offline, get count from cached roster
    const cachedRoster = getCachedClassRoster(classId);
    total = cachedRoster.length > 0 ? cachedRoster.length : records.length + queuedScans.length;
  }

  if (total === 0) {
    const cachedRoster = getCachedClassRoster(classId);
    if (cachedRoster.length > 0) total = cachedRoster.length;
  }

  const recorded = present + late + absent;
  const unrecorded = Math.max(0, total - recorded);

  return {
    total_students: total,
    present_count: present,
    late_count: late,
    absent_count: absent,
    unrecorded_count: unrecorded,
  };
}
