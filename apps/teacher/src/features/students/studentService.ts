import { getSupabaseClient } from '@qr-attendance/supabase';
import type { StudentWithSection } from '@qr-attendance/types';
import type { CreateStudentInput, UpdateStudentInput } from '@qr-attendance/validation';
import { cacheClassRoster, getCachedClassRoster } from '../attendance/offlineQueueService';

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

  try {
    let query = client
      .from('students')
      .select(`
        *,
        class_sections (
          section_name
        ),
        school_years (
          name
        )
      `)
      .order('last_name', { ascending: true });

    if (secId && secId !== 'all') {
      query = query.eq('section_id', secId);
    }

    if (filters?.gradeLevel) {
      query = query.eq('grade_level', filters.gradeLevel);
    }

    if (filters?.search) {
      const s = filters.search.trim();
      query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,lrn.ilike.%${s}%`);
    }

    const { data, error } = await query;
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

      const students: StudentWithSection[] = (data as unknown as StudentJoinRow[]).map((d) => ({
        ...d,
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString(),
        section_name: d.class_sections?.section_name || 'Unassigned',
        school_year_name: d.school_years?.name || 'Active Year',
      }));

      try {
        localStorage.setItem(cacheKey, JSON.stringify(students));
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
        }
      } catch {
        // Storage write ignored
      }

      return students;
    }
  } catch {
    // Fall back to local storage cache if offline
  }

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      let list = JSON.parse(cached) as StudentWithSection[];
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
  } catch {
    // Storage read ignored
  }

  if (secId && secId !== 'all') {
    const cachedRoster = getCachedClassRoster(secId);
    return cachedRoster.map((s) => ({
      ...s,
      sex: 'MALE' as const,
      birth_date: '2000-01-01',
      grade_level: 1,
      school_year_id: 'default',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      section_name: 'Enrolled',
      school_year_name: 'Current SY',
    }));
  }

  return [];
}

export async function createStudent(input: CreateStudentInput): Promise<StudentWithSection> {
  const client = getSupabaseClient();
  const qrIdentifier = input.qr_identifier || crypto.randomUUID();

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

  const { data, error } = await client
    .from('students')
    .insert(newRecord)
    .select(`
      *,
      class_sections (
        section_name
      ),
      school_years (
        name
      )
    `)
    .single();

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
  const { error } = await client
    .from('students')
    .update(input)
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function regenerateStudentQrIdentifier(id: string): Promise<string> {
  const client = getSupabaseClient();
  const newQr = crypto.randomUUID();
  const { error } = await client
    .from('students')
    .update({ qr_identifier: newQr, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
  return newQr;
}
