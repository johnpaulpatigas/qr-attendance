import { z } from 'zod';
import { lrnSchema } from './lrn';

export const createStudentSchema = z.object({
  lrn: lrnSchema,
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  middle_name: z.string().trim().max(100).nullable().optional(),
  suffix: z.string().trim().max(20).nullable().optional(),
  sex: z.enum(['MALE', 'FEMALE'], {
    errorMap: () => ({ message: 'Sex must be either MALE or FEMALE' }),
  }),
  birth_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in YYYY-MM-DD format'),
  grade_level: z.coerce.number().int().min(1).max(12),
  section_id: z.string().uuid('Valid section ID is required'),
  school_year_id: z.string().uuid('Valid school year ID is required'),
  qr_identifier: z.string().trim().min(1).optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
