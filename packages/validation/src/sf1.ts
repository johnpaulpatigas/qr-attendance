import { z } from 'zod';
import { lrnRegex } from './lrn';
import type { SF1ParsedStudent } from '@qr-attendance/types';

export const rawSf1RowSchema = z.object({
  lrn: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => lrnRegex.test(v), {
      message: 'Invalid LRN (must be 12 numeric digits)',
    }),
  last_name: z.string().trim().min(1, 'Last name is required'),
  first_name: z.string().trim().min(1, 'First name is required'),
  middle_name: z.string().trim().nullable().optional().default(null),
  suffix: z.string().trim().nullable().optional().default(null),
  sex: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === 'MALE' || v === 'FEMALE' || v === 'M' || v === 'F', {
      message: 'Sex must be Male or Female',
    })
    .transform((v) => (v.startsWith('M') ? ('MALE' as const) : ('FEMALE' as const))),
  birth_date: z
    .string()
    .trim()
    .refine(
      (v) => !isNaN(Date.parse(v)) || /^\d{4}-\d{2}-\d{2}$/.test(v),
      {
        message: 'Invalid birth date format',
      }
    ),
  grade_level: z.coerce.number().int().min(1).max(12),
  section_name: z.string().trim().min(1, 'Section name is required'),
  school_year: z.string().trim().min(1, 'School year is required'),
});

export function validateSf1Row(row: Record<string, unknown>): SF1ParsedStudent {
  const result = rawSf1RowSchema.safeParse(row);

  if (!result.success) {
    const errorMessages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      lrn: String(row.lrn || ''),
      last_name: String(row.last_name || ''),
      first_name: String(row.first_name || ''),
      middle_name: row.middle_name ? String(row.middle_name) : null,
      suffix: row.suffix ? String(row.suffix) : null,
      sex: String(row.sex || '').toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE',
      birth_date: String(row.birth_date || ''),
      grade_level: Number(row.grade_level) || 0,
      section_name: String(row.section_name || ''),
      school_year: String(row.school_year || ''),
      isValid: false,
      errors: errorMessages,
    };
  }

  const validData = result.data;
  return {
    lrn: validData.lrn,
    last_name: validData.last_name,
    first_name: validData.first_name,
    middle_name: validData.middle_name || null,
    suffix: validData.suffix || null,
    sex: validData.sex,
    birth_date: validData.birth_date,
    grade_level: validData.grade_level,
    section_name: validData.section_name,
    school_year: validData.school_year,
    isValid: true,
    errors: [],
  };
}
