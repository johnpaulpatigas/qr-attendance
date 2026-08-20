import { getSupabaseClient } from '@qr-attendance/supabase';
import type {
  AttendanceSession,
  AttendanceSummary,
  AttendanceRecordWithStudent,
  ClassSectionWithDetails,
  SessionType,
} from '@qr-attendance/types';

export const fallbackSections: ClassSectionWithDetails[] = [
  {
    id: 'e0123456-789a-bcde-f012-3456789abc01',
    grade_level: 12,
    section_name: 'STEM A',
    school_year_id: 'e0123456-789a-bcde-f012-3456789abc02',
    teacher_id: 't-1',
    school_year_name: '2026-2027',
    student_count: 45,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc03',
    grade_level: 11,
    section_name: 'ABM B',
    school_year_id: 'e0123456-789a-bcde-f012-3456789abc02',
    teacher_id: 't-1',
    school_year_name: '2026-2027',
    student_count: 42,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc04',
    grade_level: 10,
    section_name: 'Rizal',
    school_year_id: 'e0123456-789a-bcde-f012-3456789abc02',
    teacher_id: 't-1',
    school_year_name: '2026-2027',
    student_count: 40,
  },
];

export async function fetchClassSections(): Promise<ClassSectionWithDetails[]> {
  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('class_sections')
      .select(`
        *,
        school_years (
          name
        )
      `)
      .order('grade_level', { ascending: false });

    if (error || !data || data.length === 0) {
      return fallbackSections;
    }

    return (data as any[]).map((d) => ({
      ...d,
      school_year_name: d.school_years?.name,
      student_count: 45,
    }));
  } catch {
    return fallbackSections;
  }
}

export async function getOrCreateAttendanceSession(
  classId: string,
  attendanceDate: string,
  sessionType: SessionType,
  teacherId: string
): Promise<AttendanceSession> {
  const client = getSupabaseClient();

  try {
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

    // Create new session
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
  } catch {
    // Development fallback session
    return {
      id: `session-${classId}-${attendanceDate}-${sessionType}`,
      class_id: classId,
      teacher_id: teacherId,
      attendance_date: attendanceDate,
      session_type: sessionType,
      started_at: new Date().toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
    };
  }
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
  const records = await fetchSessionRecords(sessionId);

  let present = 0;
  let late = 0;
  let absent = 0;

  records.forEach((r) => {
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
  });

  const section = fallbackSections.find((s) => s.id === classId);
  const total = section?.student_count || 45;
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
