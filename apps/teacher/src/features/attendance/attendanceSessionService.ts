import {
  getSupabaseClient,
  AppStorage,
  getStoredOfflineUser,
  withNetworkTimeout,
  saveCachedSections,
  saveCachedSession,
  saveCachedRecords,
  getCachedRecords,
} from '@qr-attendance/supabase';
import type {
  AttendanceSession,
  AttendanceSummary,
  AttendanceRecord,
  AttendanceRecordWithStudent,
  ClassSectionWithDetails,
  SessionType,
} from '@qr-attendance/types';
import { getCachedClassRoster, getQueuedScans } from './offlineQueueService';
import { isNetworkOnline } from './networkManager';

const SECTIONS_CACHE_KEY = 'teacher_cached_sections';
const SESSION_CACHE_PREFIX = 'teacher_cached_session_';
const RECORDS_CACHE_PREFIX = 'teacher_cached_records_';

export async function fetchClassSections(): Promise<ClassSectionWithDetails[]> {
  const client = getSupabaseClient();
  let currentUserId: string | undefined;

  try {
    const { data: sessionData } = await client.auth.getSession();
    currentUserId = sessionData.session?.user?.id;
  } catch {
    // Ignore
  }

  if (!currentUserId) {
    const offlineUser = getStoredOfflineUser('teacher');
    currentUserId = offlineUser?.userId;
  }

  if (!currentUserId) {
    const cachedProf = AppStorage.getJSON<{ id?: string } | null>('teacher_auth_profile', null);
    currentUserId = cachedProf?.id;
  }

  const userCacheKey = currentUserId
    ? `${SECTIONS_CACHE_KEY}_${currentUserId}`
    : SECTIONS_CACHE_KEY;

  if (isNetworkOnline()) {
    try {
      const { data, error } = await withNetworkTimeout(
        client
          .from('class_sections')
          .select(
            `
            *,
            school_years (
              name
            ),
            students (
              id,
              lrn,
              first_name,
              last_name,
              middle_name,
              suffix,
              qr_identifier,
              section_id
            ),
            section_subject_teachers (
              id,
              class_id,
              subject_name,
              teacher_id,
              schedule_time
            )
          `
          )
          .order('grade_level', { ascending: false }),
        4000
      );

      if (!error && data) {
        if (data.length === 0) {
          return [];
        }

        interface SectionJoinRow {
          id: string;
          grade_level: number;
          section_name: string;
          room_number: string | null;
          school_year_id: string;
          teacher_id: string | null;
          adviser_id?: string | null;
          created_at: string;
          updated_at: string;
          school_years?: { name: string } | null;
          students?: {
            id: string;
            lrn?: string;
            first_name?: string;
            last_name?: string;
            middle_name?: string | null;
            suffix?: string | null;
            qr_identifier?: string;
            section_id?: string;
          }[] | null;
          section_subject_teachers?:
            | {
                id: string;
                class_id: string;
                subject_name: string;
                teacher_id: string;
                schedule_time?: string | null;
              }[]
            | null;
        }

        const sections: ClassSectionWithDetails[] = (data as unknown as SectionJoinRow[]).map(
          (d) => {
            const isAdviser = Boolean(
              currentUserId && (d.adviser_id === currentUserId || d.teacher_id === currentUserId)
            );
            const mySubjectAssignments = (d.section_subject_teachers || []).filter(
              (st) => st.teacher_id === currentUserId
            );
            const isSubjectTeacher = mySubjectAssignments.length > 0;

            return {
              id: d.id,
              grade_level: d.grade_level,
              section_name: d.section_name,
              room_number: d.room_number,
              school_year_id: d.school_year_id,
              teacher_id: d.teacher_id,
              adviser_id: d.adviser_id || d.teacher_id,
              created_at: d.created_at,
              updated_at: d.updated_at,
              school_year_name: d.school_years?.name || 'Active SY',
              student_count: Array.isArray(d.students) ? d.students.length : 0,
              subject_teachers: d.section_subject_teachers || [],
              my_role: isAdviser ? 'adviser' : isSubjectTeacher ? 'subject_teacher' : undefined,
              my_subject:
                mySubjectAssignments.map((st) => st.subject_name).join(', ') || undefined,
            };
          }
        );

        // Cache sections under storage and SQLite
        AppStorage.setJSON(userCacheKey, sections);
        AppStorage.setJSON(SECTIONS_CACHE_KEY, sections);
        saveCachedSections(sections).catch(() => {});

        return sections;
      }
    } catch {
      // Fall back to local storage cache if offline or network error
    }
  }

  // Fallback 1: User specific cache key
  const userCached = AppStorage.getJSON<ClassSectionWithDetails[] | null>(userCacheKey, null);
  if (userCached && userCached.length > 0) {
    return userCached;
  }

  // Fallback 2: General cache key
  const generalCached = AppStorage.getJSON<ClassSectionWithDetails[] | null>(
    SECTIONS_CACHE_KEY,
    null
  );
  if (generalCached && generalCached.length > 0) {
    return generalCached;
  }

  // Fallback 3: Any key starting with SECTIONS_CACHE_KEY
  try {
    const keys = AppStorage.findKeysStartingWith(SECTIONS_CACHE_KEY);
    for (const key of keys) {
      const list = AppStorage.getJSON<ClassSectionWithDetails[] | null>(key, null);
      if (list && list.length > 0) return list;
    }
  } catch {
    // Ignore
  }

  return [];
}

export async function getOrCreateAttendanceSession(
  classId: string,
  attendanceDate: string,
  sessionType: SessionType,
  teacherId?: string,
  subjectName?: string | null
): Promise<AttendanceSession | null> {
  if (!classId) return null;
  const client = getSupabaseClient();
  const subjPart = subjectName ? `_${subjectName.replace(/\s+/g, '_')}` : '';
  const cacheKey = `${SESSION_CACHE_PREFIX}${classId}_${attendanceDate}_${sessionType}${subjPart}`;

  let resolvedTeacherId = teacherId && teacherId.trim() !== '' ? teacherId.trim() : null;
  if (!resolvedTeacherId) {
    try {
      const { data: sessionData } = await client.auth.getSession();
      resolvedTeacherId = sessionData.session?.user?.id || null;
    } catch {
      // Ignore
    }
  }
  if (!resolvedTeacherId) {
    const offlineUser = getStoredOfflineUser('teacher');
    resolvedTeacherId = offlineUser?.userId || null;
  }

  if (isNetworkOnline()) {
    try {
      let query = client
        .from('attendance_sessions')
        .select('*')
        .eq('class_id', classId)
        .eq('attendance_date', attendanceDate)
        .eq('session_type', sessionType);

      if (subjectName) {
        query = query.eq('subject_name', subjectName);
      } else {
        query = query.is('subject_name', null);
      }

      const { data: existing, error: findError } = await withNetworkTimeout(
        query.maybeSingle(),
        3500
      );

      if (!findError && existing) {
        const session = existing;
        AppStorage.setJSON(cacheKey, session);
        saveCachedSession(session).catch(() => {});
        return session;
      }

      if (resolvedTeacherId) {
        const newSession = {
          class_id: classId,
          teacher_id: resolvedTeacherId,
          attendance_date: attendanceDate,
          session_type: sessionType,
          subject_name: subjectName || null,
          started_at: new Date().toISOString(),
        };

        const { data: created, error: createError } = await withNetworkTimeout(
          client.from('attendance_sessions').insert(newSession).select().maybeSingle(),
          3500
        );

        if (createError) {
          if (createError.code === '23503') {
            console.warn(`Class section ${classId} does not exist in database.`);
            return null;
          }
        } else if (created) {
          const session = created;
          AppStorage.setJSON(cacheKey, session);
          saveCachedSession(session).catch(() => {});
          return session;
        }
      }
    } catch {
      // Network offline fallback
    }
  }

  // Offline fallback: check local cache or construct offline session object
  const cached = AppStorage.getJSON<AttendanceSession | null>(cacheKey, null);
  if (cached) return cached;

  const offlineSession: AttendanceSession = {
    id: `offline_sess_${classId}_${attendanceDate}_${sessionType}${subjPart}`,
    class_id: classId,
    teacher_id: resolvedTeacherId || '',
    attendance_date: attendanceDate,
    session_type: sessionType,
    subject_name: subjectName || null,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
  };

  AppStorage.setJSON(cacheKey, offlineSession);
  saveCachedSession(offlineSession).catch(() => {});
  return offlineSession;
}

export async function assignSubjectTeacher(
  classId: string,
  subjectName: string,
  teacherId: string,
  scheduleTime?: string | null
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  try {
    const { error } = await withNetworkTimeout(
      client.from('section_subject_teachers').upsert(
        {
          class_id: classId,
          subject_name: subjectName.trim(),
          teacher_id: teacherId,
          schedule_time: scheduleTime?.trim() || null,
        },
        { onConflict: 'class_id,subject_name,teacher_id' }
      ),
      3500
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to assign subject teacher',
    };
  }
}

export async function removeSubjectTeacher(
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  try {
    const { error } = await withNetworkTimeout(
      client.from('section_subject_teachers').delete().eq('id', assignmentId),
      3500
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove subject teacher',
    };
  }
}

export async function claimClassSection(
  classId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  let userId: string | undefined;

  try {
    const { data: authData } = await client.auth.getUser();
    userId = authData.user?.id;
  } catch {
    // Ignore
  }

  if (!userId) {
    const offlineUser = getStoredOfflineUser('teacher');
    userId = offlineUser?.userId;
  }

  if (!userId) return { success: false, error: 'User not authenticated' };

  try {
    const { error } = await withNetworkTimeout(
      client
        .from('class_sections')
        .update({ adviser_id: userId, teacher_id: userId })
        .eq('id', classId),
      3500
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to claim section',
    };
  }
}

export async function fetchSessionRecords(
  sessionId: string
): Promise<AttendanceRecordWithStudent[]> {
  const client = getSupabaseClient();
  const cacheKey = `${RECORDS_CACHE_PREFIX}${sessionId}`;

  const isSyntheticOffline = sessionId.startsWith('offline_sess_') || sessionId === '00000000-0000-0000-0000-000000000000';

  if (isSyntheticOffline || !isNetworkOnline()) {
    const memRecords = AppStorage.getJSON<AttendanceRecordWithStudent[]>(cacheKey, []);
    if (memRecords.length > 0) return memRecords;
    return getCachedRecords(sessionId);
  }

  try {
    const { data, error } = await withNetworkTimeout(
      client
        .from('attendance')
        .select(
          `
          *,
          students (
            id,
            lrn,
            first_name,
            last_name,
            middle_name,
            suffix
          )
        `
        )
        .eq('attendance_session_id', sessionId)
        .order('recorded_at', { ascending: false }),
      4000
    );

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

      const records: AttendanceRecordWithStudent[] = (
        data as unknown as AttendanceRecordJoinRow[]
      ).map((d) => ({
        ...d,
        student: d.students || undefined,
      }));

      AppStorage.setJSON(cacheKey, records);
      saveCachedRecords(sessionId, records).catch(() => {});
      return records;
    }
  } catch {
    // Fall back to local storage cache if offline or timeout
  }

  const memRecords = AppStorage.getJSON<AttendanceRecordWithStudent[]>(cacheKey, []);
  if (memRecords.length > 0) return memRecords;
  return getCachedRecords(sessionId);
}

export async function fetchAttendanceSummary(
  sessionId: string,
  classId: string,
  existingRecords?: AttendanceRecordWithStudent[]
): Promise<AttendanceSummary> {
  const client = getSupabaseClient();
  const records = existingRecords ?? (await fetchSessionRecords(sessionId));

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
  if (isNetworkOnline()) {
    try {
      const { count, error } = await withNetworkTimeout(
        client
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('section_id', classId),
        3000
      );

      if (!error && typeof count === 'number') {
        total = count;
      }
    } catch {
      // Offline fallback
    }
  }

  if (total === 0) {
    const cachedRoster = getCachedClassRoster(classId);
    total = cachedRoster.length > 0 ? cachedRoster.length : records.length + queuedScans.length;
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
