-- ==============================================================================
-- Migration: High School Multi-Subject Teachers & Section Subject Assignments
-- ==============================================================================
-- Supports DepEd High School (e.g. MNHS) multi-teacher structure:
-- 1. Every section has one Class Adviser and multiple Subject Teachers (Math, Science, English, etc.)
-- 2. Teachers can teach multiple sections and take subject-specific or homeroom attendance
-- 3. Teachers can ONLY view & scan students in sections they teach or advise
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update `class_sections` to support explicit adviser_id
-- ------------------------------------------------------------------------------
ALTER TABLE public.class_sections ADD COLUMN IF NOT EXISTS adviser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill adviser_id from teacher_id if present
UPDATE public.class_sections SET adviser_id = teacher_id WHERE adviser_id IS NULL AND teacher_id IS NOT NULL;
UPDATE public.class_sections SET teacher_id = adviser_id WHERE teacher_id IS NULL AND adviser_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Create `section_subject_teachers` Table (Many-to-Many for Subject Teachers)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_subject_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  subject_name VARCHAR(100) NOT NULL, -- e.g. 'Mathematics', 'Science', 'English', 'Filipino', 'AP', 'MAPEH', 'TLE', 'EsP'
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_time TEXT, -- e.g. '7:30 AM - 8:30 AM (M-F)'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_section_subject_teacher UNIQUE (class_id, subject_name, teacher_id)
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_class ON public.section_subject_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_teacher ON public.section_subject_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_subject ON public.section_subject_teachers(subject_name);

-- Enable RLS
ALTER TABLE public.section_subject_teachers ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Update `attendance_sessions` and `attendance` to support Subject-Level Attendance
-- ------------------------------------------------------------------------------
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_subject ON public.attendance_sessions(class_id, attendance_date, subject_name);
CREATE INDEX IF NOT EXISTS idx_attendance_subject ON public.attendance(student_id, attendance_date, subject_name);

-- ------------------------------------------------------------------------------
-- 4. Helper Function: Check if user is Adviser OR Subject Teacher of class
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.class_sections
      WHERE id = target_class_id
        AND (
          teacher_id = (SELECT auth.uid())
          OR adviser_id = (SELECT auth.uid())
          OR (teacher_id IS NULL AND adviser_id IS NULL)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.section_subject_teachers
      WHERE class_id = target_class_id AND teacher_id = (SELECT auth.uid())
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(UUID) TO authenticated;

-- Helper function to check if user is the Class Adviser specifically
CREATE OR REPLACE FUNCTION public.is_adviser_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.class_sections
      WHERE id = target_class_id
        AND (
          teacher_id = (SELECT auth.uid())
          OR adviser_id = (SELECT auth.uid())
          OR (teacher_id IS NULL AND adviser_id IS NULL)
        )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_adviser_of_class(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Strict RLS Policies for `section_subject_teachers`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view subject teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Advisers and admins can manage subject teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Service role full access on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict SELECT on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict INSERT on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict UPDATE on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict DELETE on section_subject_teachers" ON public.section_subject_teachers;

-- SELECT: Teachers see subject assignments for their classes; Admins see all
CREATE POLICY "Strict SELECT on section_subject_teachers"
  ON public.section_subject_teachers
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = (SELECT auth.uid())
    OR public.is_teacher_of_class(class_id)
  );

-- INSERT: Class Advisers, Teachers, and Admins can assign subject teachers
CREATE POLICY "Strict INSERT on section_subject_teachers"
  ON public.section_subject_teachers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  );

-- UPDATE: Class Advisers, assigned teachers, and Admins can update subject assignments
CREATE POLICY "Strict UPDATE on section_subject_teachers"
  ON public.section_subject_teachers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  );

-- DELETE: Class Advisers, assigned teachers, and Admins can delete subject assignments
CREATE POLICY "Strict DELETE on section_subject_teachers"
  ON public.section_subject_teachers
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  );

CREATE POLICY "Service role full access on section_subject_teachers"
  ON public.section_subject_teachers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. Updated Strict RLS Policies for `class_sections`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Authenticated users can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can insert class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can update class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can delete class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Service role full access on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict SELECT on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict INSERT on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict UPDATE on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict DELETE on class_sections" ON public.class_sections;

-- SELECT: Class Advisers, Subject Teachers, and Parents of enrolled students can view class
CREATE POLICY "Strict SELECT on class_sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(id)
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_parents sp ON s.id = sp.student_id
      JOIN public.parents p ON sp.parent_id = p.id
      WHERE s.section_id = class_sections.id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

-- INSERT: Teachers can create sections and set themselves as adviser (or unassigned)
CREATE POLICY "Strict INSERT on class_sections"
  ON public.class_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR adviser_id = (SELECT auth.uid())
        OR (teacher_id IS NULL AND adviser_id IS NULL)
      )
    )
  );

-- UPDATE: Class Advisers and Admins can update class sections
CREATE POLICY "Strict UPDATE on class_sections"
  ON public.class_sections
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(id)
  );

-- DELETE: Class Advisers and Admins can delete class sections
CREATE POLICY "Strict DELETE on class_sections"
  ON public.class_sections
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR adviser_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Service role full access on class_sections"
  ON public.class_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. Updated Strict RLS Policies for `students`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can insert students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can update students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can delete students" ON public.students;
DROP POLICY IF EXISTS "Service role full access on students" ON public.students;
DROP POLICY IF EXISTS "Strict SELECT on students" ON public.students;
DROP POLICY IF EXISTS "Strict INSERT on students" ON public.students;
DROP POLICY IF EXISTS "Strict UPDATE on students" ON public.students;
DROP POLICY IF EXISTS "Strict DELETE on students" ON public.students;

-- SELECT: Advisers & Subject Teachers can view students enrolled in sections they teach; Parents can view linked children
CREATE POLICY "Strict SELECT on students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(students.section_id)
    OR public.is_parent_of_student(students.id)
  );

-- INSERT: Class Advisers and Admins can insert students into their sections
CREATE POLICY "Strict INSERT on students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
  );

-- UPDATE: Class Advisers and Admins can update students in their sections
CREATE POLICY "Strict UPDATE on students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
  );

-- DELETE: Class Advisers and Admins can delete students in their sections
CREATE POLICY "Strict DELETE on students"
  ON public.students
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
  );

CREATE POLICY "Service role full access on students"
  ON public.students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 8. Updated Strict RLS Policies for `attendance_sessions` and `attendance`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Strict SELECT on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict INSERT on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict UPDATE on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict DELETE on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Service role full access on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = (SELECT auth.uid())
    OR public.is_teacher_of_class(attendance_sessions.class_id)
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_parents sp ON s.id = sp.student_id
      JOIN public.parents p ON sp.parent_id = p.id
      WHERE s.section_id = attendance_sessions.class_id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Strict INSERT on attendance_sessions"
  ON public.attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND teacher_id = (SELECT auth.uid())
      AND public.is_teacher_of_class(attendance_sessions.class_id)
    )
  );

CREATE POLICY "Strict UPDATE on attendance_sessions"
  ON public.attendance_sessions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR public.is_adviser_of_class(attendance_sessions.class_id)
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR public.is_adviser_of_class(attendance_sessions.class_id)
      )
    )
  );

CREATE POLICY "Strict DELETE on attendance_sessions"
  ON public.attendance_sessions
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR public.is_adviser_of_class(attendance_sessions.class_id)
      )
    )
  );

CREATE POLICY "Service role full access on attendance_sessions"
  ON public.attendance_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Attendance Records
DROP POLICY IF EXISTS "Strict SELECT on attendance" ON public.attendance;
DROP POLICY IF EXISTS "Strict INSERT on attendance" ON public.attendance;
DROP POLICY IF EXISTS "Strict UPDATE on attendance" ON public.attendance;
DROP POLICY IF EXISTS "Strict DELETE on attendance" ON public.attendance;
DROP POLICY IF EXISTS "Service role full access on attendance" ON public.attendance;

CREATE POLICY "Strict SELECT on attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR recorded_by = (SELECT auth.uid())
    OR public.is_teacher_of_class(attendance.class_id)
    OR public.is_parent_of_student(attendance.student_id)
  );

CREATE POLICY "Strict INSERT on attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND recorded_by = (SELECT auth.uid())
      AND public.is_teacher_of_class(attendance.class_id)
    )
  );

CREATE POLICY "Strict UPDATE on attendance"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR recorded_by = (SELECT auth.uid())
    OR public.is_adviser_of_class(attendance.class_id)
  )
  WITH CHECK (
    public.is_admin()
    OR recorded_by = (SELECT auth.uid())
    OR public.is_adviser_of_class(attendance.class_id)
  );

CREATE POLICY "Strict DELETE on attendance"
  ON public.attendance
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR recorded_by = (SELECT auth.uid())
    OR public.is_adviser_of_class(attendance.class_id)
  );

CREATE POLICY "Service role full access on attendance"
  ON public.attendance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
