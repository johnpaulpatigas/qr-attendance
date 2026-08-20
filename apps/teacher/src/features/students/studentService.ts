import { getSupabaseClient } from '@qr-attendance/supabase';
import type { StudentWithSection } from '@qr-attendance/types';
import type { CreateStudentInput, UpdateStudentInput } from '@qr-attendance/validation';

export interface StudentFilters {
  search?: string;
  sectionId?: string;
  gradeLevel?: number;
}

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

    if (filters?.search) {
      const s = filters.search.trim();
      query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,lrn.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error || !data) {
      return [];
    }

    return (data as any[]).map((d) => ({
      ...d,
      section_name: d.class_sections?.section_name || 'Unassigned',
      school_year_name: d.school_years?.name || 'Active Year',
    }));
  } catch {
    return [];
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

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    section_name: data.class_sections?.section_name,
    school_year_name: data.school_years?.name,
  } as StudentWithSection;
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
