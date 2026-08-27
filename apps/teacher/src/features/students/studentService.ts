import { getSupabaseClient, AppStorage, withNetworkTimeout } from '@qr-attendance/supabase';
import type { StudentWithSection } from '@qr-attendance/types';
import type { CreateStudentInput, UpdateStudentInput } from '@qr-attendance/validation';
import { cacheClassRoster, getCachedClassRoster } from '../attendance/offlineQueueService';
import { isNetworkOnline } from '../attendance/networkManager';
import { fetchClassSections } from '../attendance/attendanceSessionService';

export interface StudentFilters {
  search?: string;
  sectionId?: string;
  gradeLevel?: number;
}

const STUDENTS_CACHE_PREFIX = 'teacher_cached_students_';

export async function fetchStudents(filters?: StudentFilters): Promise<StudentWithSection[]> {
  const client = getSupabaseClient();
  const secId = filters?.sectionId;
  const cacheKey = `${STUDENTS_CACHE_PREFIX}${secId || 'all'}`;

  // Get teacher's assigned sections for strict data isolation
  const mySections = await fetchClassSections();
  const teacherSectionIds = mySections.map((s) => s.id);
  const teacherSectionIdSet = new Set(teacherSectionIds);

  // If teacher has no assigned classes, they cannot see any student records
  if (teacherSectionIds.length === 0) {
    return [];
  }

  if (isNetworkOnline()) {
    try {
      let query = client
        .from('students')
        .select(
          `
          *,
          class_sections (
            section_name
          ),
          school_years (
            name
          )
        `
        )
        .order('last_name', { ascending: true });

      if (secId && secId !== 'all') {
        // Verify that requested section belongs to teacher
        if (!teacherSectionIdSet.has(secId)) {
          return [];
        }
        query = query.eq('section_id', secId);
      } else {
        // Strict scope to only the teacher's assigned classes
        query = query.in('section_id', teacherSectionIds);
      }

      if (filters?.gradeLevel) {
        query = query.eq('grade_level', filters.gradeLevel);
      }

      if (filters?.search) {
        const s = filters.search.trim();
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,lrn.ilike.%${s}%`);
      }

      const { data, error } = await withNetworkTimeout(query, 4000);
      if (!error && data) {
        interface StudentJoinRow {
          id: string;
          lrn: string;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          suffix: string | null;
          sex: 'MALE' | 'FEMALE';
          birth_date: string;
          grade_level: number;
          section_id: string;
          school_year_id: string;
          qr_identifier: string;
          created_at: string;
          updated_at: string;
          class_sections?: {
            section_name?: string;
          } | null;
          school_years?: {
            name?: string;
          } | null;
        }

        const students: StudentWithSection[] = (data as unknown as StudentJoinRow[])
          .filter((d) => teacherSectionIdSet.has(d.section_id))
          .map((d) => ({
            ...d,
            created_at: d.created_at || new Date().toISOString(),
            updated_at: d.updated_at || new Date().toISOString(),
            section_name: d.class_sections?.section_name || 'Unassigned',
            school_year_name: d.school_years?.name || 'Active Year',
          }));

        AppStorage.setJSON(cacheKey, students);

        // Populate offline scanning roster for each class section
        if (secId && secId !== 'all') {
          cacheClassRoster(
            secId,
            students.map((s) => ({
              id: s.id,
              lrn: s.lrn,
              first_name: s.first_name,
              last_name: s.last_name,
              middle_name: s.middle_name,
              suffix: s.suffix,
              qr_identifier: s.qr_identifier,
              section_id: s.section_id,
            }))
          );
        } else {
          // Group by section and cache
          const bySection = new Map<string, typeof students>();
          students.forEach((s) => {
            const list = bySection.get(s.section_id) || [];
            list.push(s);
            bySection.set(s.section_id, list);
          });
          bySection.forEach((sectStudents, sectionId) => {
            cacheClassRoster(
              sectionId,
              sectStudents.map((s) => ({
                id: s.id,
                lrn: s.lrn,
                first_name: s.first_name,
                last_name: s.last_name,
                middle_name: s.middle_name,
                suffix: s.suffix,
                qr_identifier: s.qr_identifier,
                section_id: s.section_id,
              }))
            );
          });
        }

        return students;
      }
    } catch {
      // Fall back to local storage cache if offline
    }
  }

  // Offline Fallback 1: specific cacheKey
  let cached = AppStorage.getJSON<StudentWithSection[] | null>(cacheKey, null);

  // Offline Fallback 2: If searching a specific section and cacheKey was empty, check class roster
  if ((!cached || cached.length === 0) && secId && secId !== 'all') {
    if (teacherSectionIdSet.has(secId)) {
      const cachedRoster = getCachedClassRoster(secId);
      if (cachedRoster.length > 0) {
        cached = cachedRoster.map((s) => ({
          ...s,
          sex: 'MALE' as const,
          birth_date: '2000-01-01',
          grade_level: filters?.gradeLevel || 10,
          school_year_id: 'default',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          section_name: mySections.find((sec) => sec.id === secId)?.section_name || 'Enrolled',
          school_year_name: 'Current SY',
        }));
      }
    }
  }

  // Offline Fallback 3: If 'all' was queried, only collect from the teacher's assigned section rosters
  if (!cached || cached.length === 0) {
    const allStudentsMap = new Map<string, StudentWithSection>();
    for (const sectionId of teacherSectionIds) {
      const list = AppStorage.getJSON<StudentWithSection[]>(
        `${STUDENTS_CACHE_PREFIX}${sectionId}`,
        []
      );
      if (list.length > 0) {
        list.forEach((s) => {
          if (teacherSectionIdSet.has(s.section_id)) {
            allStudentsMap.set(s.id, s);
          }
        });
      } else {
        const roster = getCachedClassRoster(sectionId);
        const sectionName = mySections.find((sec) => sec.id === sectionId)?.section_name || 'Enrolled';
        roster.forEach((s) => {
          allStudentsMap.set(s.id, {
            ...s,
            sex: 'MALE' as const,
            birth_date: '2000-01-01',
            grade_level: s.grade_level || 10,
            school_year_id: 'default',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            section_name: sectionName,
            school_year_name: 'Current SY',
          });
        });
      }
    }
    if (allStudentsMap.size > 0) {
      cached = Array.from(allStudentsMap.values());
    }
  }

  if (cached && cached.length > 0) {
    // Strictly filter out any students that do not belong to teacher's classes
    let list = cached.filter((st) => teacherSectionIdSet.has(st.section_id));

    if (filters?.gradeLevel) {
      list = list.filter((st) => Number(st.grade_level) === Number(filters.gradeLevel));
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(
        (st) =>
          st.first_name.toLowerCase().includes(s) ||
          st.last_name.toLowerCase().includes(s) ||
          st.lrn.includes(s)
      );
    }
    return list;
  }

  return [];
}

export async function createStudent(input: CreateStudentInput): Promise<StudentWithSection> {
  const client = getSupabaseClient();
  const qrIdentifier = input.qr_identifier || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `std_${Date.now()}`);

  const newRecord = {
    lrn: input.lrn,
    last_name: input.last_name,
    first_name: input.first_name,
    middle_name: input.middle_name || null,
    suffix: input.suffix || null,
    sex: input.sex,
    birth_date: input.birth_date,
    grade_level: input.grade_level,
    section_id: input.section_id,
    school_year_id: input.school_year_id,
    qr_identifier: qrIdentifier,
  };

  const { data, error } = await withNetworkTimeout(
    client
      .from('students')
      .insert(newRecord)
      .select(
        `
        *,
        class_sections (
          section_name
        ),
        school_years (
          name
        )
      `
      )
      .single(),
    4000
  );

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create student');
  }

  interface CreatedStudentJoinRow {
    id: string;
    lrn: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
    sex: 'MALE' | 'FEMALE';
    birth_date: string;
    grade_level: number;
    section_id: string;
    school_year_id: string;
    qr_identifier: string;
    created_at: string;
    updated_at: string;
    class_sections?: { section_name?: string } | null;
    school_years?: { name?: string } | null;
  }

  const typedData = data as unknown as CreatedStudentJoinRow;

  return {
    ...typedData,
    section_name: typedData.class_sections?.section_name,
    school_year_name: typedData.school_years?.name,
  };
}

export async function updateStudent(id: string, input: UpdateStudentInput): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await withNetworkTimeout(
    client.from('students').update(input).eq('id', id),
    4000
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function regenerateStudentQrIdentifier(id: string): Promise<string> {
  const client = getSupabaseClient();
  const newQr = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `std_qr_${Date.now()}`;
  const { error } = await withNetworkTimeout(
    client
      .from('students')
      .update({ qr_identifier: newQr, updated_at: new Date().toISOString() })
      .eq('id', id),
    4000
  );

  if (error) {
    throw new Error(error.message);
  }
  return newQr;
}
