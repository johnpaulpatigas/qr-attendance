import { getSupabaseClient } from '@qr-attendance/supabase';
import type { StudentWithSection } from '@qr-attendance/types';
import type { CreateStudentInput, UpdateStudentInput } from '@qr-attendance/validation';

export interface StudentFilters {
  search?: string;
  sectionId?: string;
  gradeLevel?: number;
}

// Initial mock dataset for development and instant testability
export const fallbackStudents: StudentWithSection[] = [
  {
    id: 'e0123456-789a-bcde-f012-3456789abcde',
    lrn: '108234981234',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    middle_name: 'Mercado',
    suffix: null,
    sex: 'MALE',
    birth_date: '2008-05-14',
    grade_level: 12,
    section_id: 'sec-1',
    school_year_id: 'sy-2026',
    section_name: 'STEM A',
    school_year_name: '2026-2027',
    qr_identifier: '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abcdf',
    lrn: '108234981235',
    first_name: 'Maria Clara',
    last_name: 'Santos',
    middle_name: 'Reyes',
    suffix: null,
    sex: 'FEMALE',
    birth_date: '2008-09-22',
    grade_level: 12,
    section_id: 'sec-1',
    school_year_id: 'sy-2026',
    section_name: 'STEM A',
    school_year_name: '2026-2027',
    qr_identifier: '8a0b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abcda',
    lrn: '108234981236',
    first_name: 'Crisostomo',
    last_name: 'Ibarra',
    middle_name: 'Magsalin',
    suffix: 'Jr.',
    sex: 'MALE',
    birth_date: '2008-01-10',
    grade_level: 12,
    section_id: 'sec-1',
    school_year_id: 'sy-2026',
    section_name: 'STEM A',
    school_year_name: '2026-2027',
    qr_identifier: '9b1c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abcdb',
    lrn: '108234981237',
    first_name: 'Basilio',
    last_name: 'Sisa',
    middle_name: null,
    suffix: null,
    sex: 'MALE',
    birth_date: '2009-03-18',
    grade_level: 11,
    section_id: 'sec-2',
    school_year_id: 'sy-2026',
    section_name: 'ABM B',
    school_year_name: '2026-2027',
    qr_identifier: '0c2d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function fetchStudents(filters?: StudentFilters): Promise<StudentWithSection[]> {
  const client = getSupabaseClient();
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

    const secId = filters?.sectionId;
    if (secId && secId !== 'all') {
      query = query.eq('section_id', secId);
    }

    if (filters?.gradeLevel) {
      query = query.eq('grade_level', filters.gradeLevel);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      // Return filtered fallback data
      let result = [...fallbackStudents];
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        result = result.filter(
          (item) =>
            item.last_name.toLowerCase().includes(s) ||
            item.first_name.toLowerCase().includes(s) ||
            item.lrn.includes(s)
        );
      }
      if (secId && secId !== 'all') {
        const targetSec = secId.toLowerCase();
        result = result.filter(
          (item) =>
            item.section_id === secId ||
            (item.section_name && item.section_name.toLowerCase() === targetSec)
        );
      }
      if (filters?.gradeLevel) {
        result = result.filter((item) => item.grade_level === filters.gradeLevel);
      }
      return result;
    }

    return (data as any[]).map((d) => ({
      ...d,
      section_name: d.class_sections?.section_name,
      school_year_name: d.school_years?.name,
    }));
  } catch {
    return fallbackStudents;
  }
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

  const { data, error } = await (client.from('students') as any)
    .insert(newRecord)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as StudentWithSection;
}

export async function updateStudent(id: string, input: UpdateStudentInput): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await (client.from('students') as any)
    .update(input)
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function regenerateStudentQrIdentifier(id: string): Promise<string> {
  const client = getSupabaseClient();
  const newQr = crypto.randomUUID();
  const { error } = await (client.from('students') as any)
    .update({ qr_identifier: newQr, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
  return newQr;
}
