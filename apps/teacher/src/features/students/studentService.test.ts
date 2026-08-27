import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStudents } from './studentService';
import * as attendanceSessionService from '../attendance/attendanceSessionService';
import { AppStorage } from '@qr-attendance/supabase';

describe('Student Service (Strict Teacher Data Isolation)', () => {
  beforeEach(() => {
    AppStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns empty array when teacher has no assigned classes', async () => {
    vi.spyOn(attendanceSessionService, 'fetchClassSections').mockResolvedValue([]);

    const students = await fetchStudents();
    expect(students).toEqual([]);
  });

  it('filters students strictly to the teacher assigned sections in offline cache', async () => {
    const mockSections = [
      {
        id: 'sec-my-class-1',
        grade_level: 10,
        section_name: 'SSC',
        room_number: '101',
        school_year_id: 'sy-1',
        teacher_id: 'teacher-1',
        adviser_id: 'teacher-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        student_count: 1,
        my_role: 'adviser' as const,
      },
    ];

    vi.spyOn(attendanceSessionService, 'fetchClassSections').mockResolvedValue(mockSections);

    // Cache students belonging to my class AND students belonging to another teacher's class
    AppStorage.setJSON('teacher_cached_students_sec-my-class-1', [
      {
        id: 'std-1',
        lrn: '123456789012',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        middle_name: null,
        suffix: null,
        sex: 'MALE',
        birth_date: '2008-01-01',
        grade_level: 10,
        section_id: 'sec-my-class-1',
        school_year_id: 'sy-1',
        qr_identifier: 'qr-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        section_name: 'SSC',
      },
    ]);

    AppStorage.setJSON('teacher_cached_students_sec-other-teacher', [
      {
        id: 'std-2',
        lrn: '999999999999',
        first_name: 'Other',
        last_name: 'Student',
        middle_name: null,
        suffix: null,
        sex: 'FEMALE',
        birth_date: '2008-01-01',
        grade_level: 10,
        section_id: 'sec-other-teacher',
        school_year_id: 'sy-1',
        qr_identifier: 'qr-2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        section_name: 'Other Class',
      },
    ]);

    const result = await fetchStudents();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('std-1');
    expect(result[0].last_name).toBe('Dela Cruz');
    // Ensure the other teacher's student is NOT returned
    expect(result.some((s) => s.id === 'std-2')).toBe(false);
  });
});
