import { getSupabaseClient } from '@qr-attendance/supabase';
import type { SF1ImportSummary } from '@qr-attendance/types';
import type { SF1ValidatedRecord } from './sf1Validator';

export async function executeSF1Import(
  records: SF1ValidatedRecord[]
): Promise<SF1ImportSummary> {
  const client = getSupabaseClient();
  const validRecords = records.filter((r) => r.isValid);

  let createdCount = 0;
  let updatedCount = 0;
  const errors: Array<{ row: number; lrn?: string; message: string }> = [];

  // 1. Resolve or create active school year
  let schoolYearId: string;
  try {
    const { data: activeSy } = await client
      .from('school_years')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();

    if (activeSy) {
      schoolYearId = (activeSy as any).id;
    } else {
      const { data: firstSy } = await client
        .from('school_years')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (firstSy) {
        schoolYearId = (firstSy as any).id;
      } else {
        const { data: newSy, error: syErr } = await (client.from('school_years') as any)
          .insert({
            name: '2026-2027',
            start_date: '2026-08-01',
            end_date: '2027-05-31',
            is_active: true,
          })
          .select()
          .single();

        if (syErr) throw new Error(syErr.message);
        schoolYearId = newSy.id;
      }
    }
  } catch (err: any) {
    throw new Error(`Failed to resolve school year: ${err.message}`);
  }

  // 2. Cache or create class sections
  const sectionCache = new Map<string, string>(); // `${gradeLevel}_${sectionName}` -> sectionId

  for (const record of validRecords) {
    try {
      const grade = record.data.grade_level;
      const sectionName = record.data.section_name.trim();
      const cacheKey = `${grade}_${sectionName.toLowerCase()}`;

      let sectionId = sectionCache.get(cacheKey);
      if (!sectionId) {
        // Query database for section
        const { data: existingSec } = await client
          .from('class_sections')
          .select('id')
          .eq('school_year_id', schoolYearId)
          .eq('grade_level', grade)
          .ilike('section_name', sectionName)
          .maybeSingle();

        if (existingSec) {
          sectionId = (existingSec as any).id;
        } else {
          // Create section
          const { data: createdSec, error: secErr } = await (client.from('class_sections') as any)
            .insert({
              school_year_id: schoolYearId,
              grade_level: grade,
              section_name: sectionName,
            })
            .select()
            .single();

          if (secErr) throw new Error(secErr.message);
          sectionId = createdSec.id;
        }
        sectionCache.set(cacheKey, sectionId as string);
      }

      // Check if student exists
      const { data: existingStudent } = await client
        .from('students')
        .select('id, qr_identifier')
        .eq('lrn', record.data.lrn)
        .maybeSingle();

      const studentData = {
        lrn: record.data.lrn,
        last_name: record.data.last_name,
        first_name: record.data.first_name,
        middle_name: record.data.middle_name || null,
        suffix: record.data.suffix || null,
        sex: record.data.sex,
        birth_date: record.data.birth_date,
        grade_level: grade,
        section_id: sectionId,
        school_year_id: schoolYearId,
        qr_identifier: (existingStudent as any)?.qr_identifier || crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      };

      if (existingStudent) {
        const { error: updateErr } = await (client.from('students') as any)
          .update(studentData)
          .eq('id', (existingStudent as any).id);

        if (updateErr) throw new Error(updateErr.message);
        updatedCount++;
      } else {
        const { error: insertErr } = await (client.from('students') as any)
          .insert(studentData);

        if (insertErr) throw new Error(insertErr.message);
        createdCount++;
      }
    } catch (err: unknown) {
      errors.push({
        row: record.rowIndex,
        lrn: record.data.lrn,
        message: err instanceof Error ? err.message : 'Unknown database error',
      });
    }
  }

  return {
    total_rows: records.length,
    valid_rows: validRecords.length,
    invalid_rows: records.length - validRecords.length,
    duplicate_lrns: records.filter((r) => r.isDuplicateInFile).length,
    created_students: createdCount,
    updated_students: updatedCount,
    errors,
  };
}
