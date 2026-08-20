import { getSupabaseClient } from '@qr-attendance/supabase';
import type {
  AttendanceSession,
  AttendanceSummary,
  AttendanceRecordWithStudent,
  ClassSectionWithDetails,
  SessionType,
} from '@qr-attendance/types';

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

    if (error || !data) {
      return [];
    }

    return (data as any[]).map((d) => ({
      ...d,
      school_year_name: d.school_years?.name || 'Active SY',
      student_count: Array.isArray(d.students) ? d.students.length : 0,
    }));
  } catch {
    return [];
  }
}

export async function getOrCreateAttendanceSession(
  classId: string,
  attendanceDate: string,
  sessionType: SessionType,
  teacherId: string
): Promise<AttendanceSession> {
  const client = getSupabaseClient();

  // Check for existing session
  const { data: existing, error: findError } = await client
    .from('attendance_sessions')
    .select('*')
    .eq('class_id', classId)
    .eq('attendance_date', attendanceDate)
    .eq('session_type', sessionType)
    .maybeSingle();

  if (!findError && existing) {
    return existing as unknown as AttendanceSession;
  }

  // Create new session in database
  const newSession = {
    class_id: classId,
    teacher_id: teacherId,
    attendance_date: attendanceDate,
    session_type: sessionType,
    started_at: new Date().toISOString(),
  };

  const { data: created, error: createError } = await (client
    .from('attendance_sessions') as any)
    .insert(newSession)
    .select()
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created as unknown as AttendanceSession;
}

export async function fetchSessionRecords(
  sessionId: string
): Promise<AttendanceRecordWithStudent[]> {
  const client = getSupabaseClient();
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

    if (error || !data) {
      return [];
    }

    return (data as any[]).map((d) => ({
      ...d,
      student: d.students,
    }));
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

  let present = 0;
  let late = 0;
  let absent = 0;

  records.forEach((r) => {
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
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
    total = records.length;
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
