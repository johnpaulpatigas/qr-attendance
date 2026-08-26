import { z } from 'zod';
import { qrPayloadSchema } from './qr';

export const sessionTypeSchema = z.enum(['morning', 'afternoon']);
export const attendanceStatusSchema = z.enum(['present', 'late', 'absent', 'excused']);
export const attendanceSourceSchema = z.enum(['qr_scan', 'manual', 'import', 'correction']);

export const recordAttendanceRequestSchema = z.object({
  qr_payload: qrPayloadSchema,
  class_id: z.string().uuid('Valid Class ID is required'),
  session_id: z.string().uuid('Valid Attendance Session ID is required'),
  attendance_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  session_type: sessionTypeSchema,
  subject_name: z.string().trim().max(100).optional().nullable(),
  status: attendanceStatusSchema.optional().default('present'),
  client_event_id: z.string().trim().uuid().optional(),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceRequestSchema>;

export const createAttendanceSessionSchema = z.object({
  class_id: z.string().uuid('Valid Class ID is required'),
  attendance_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  session_type: sessionTypeSchema,
  subject_name: z.string().trim().max(100).optional().nullable(),
});

export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

export const manualAttendanceCorrectionSchema = z.object({
  attendance_id: z.string().uuid('Valid Attendance ID is required'),
  status: attendanceStatusSchema,
  reason: z.string().trim().min(3, 'Correction reason must be at least 3 characters long'),
});

export type ManualAttendanceCorrectionInput = z.infer<typeof manualAttendanceCorrectionSchema>;

export const assignSubjectTeacherSchema = z.object({
  class_id: z.string().uuid('Valid Class ID is required'),
  subject_name: z.string().trim().min(2, 'Subject name must be at least 2 characters').max(100),
  teacher_id: z.string().uuid('Valid Teacher ID is required'),
  schedule_time: z.string().trim().max(100).optional().nullable(),
});

export type AssignSubjectTeacherInput = z.infer<typeof assignSubjectTeacherSchema>;
