-- ==============================================================================
-- Migration: Strict Teacher Student Isolation & Section Ownership
-- ==============================================================================
-- Ensures that:
-- 1. Unassigned sections (where teacher_id IS NULL AND adviser_id IS NULL) are NOT
--    universally visible to all teachers. Teachers can ONLY access classes they
--    explicitly advise or teach as subject teachers.
-- 2. Teachers can ONLY view, insert, update, or delete students enrolled in their
--    own assigned classes.
-- 3. Any section created by a teacher automatically requires explicit ownership.
-- ==============================================================================

-- 1. Helper: Check if teacher teaches or advises a class section (NO unassigned leak)
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.section_subject_teachers
      WHERE class_id = target_class_id AND teacher_id = (SELECT auth.uid())
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(UUID) TO authenticated;

-- 2. Helper: Check if teacher is specifically the Class Adviser (NO unassigned leak)
CREATE OR REPLACE FUNCTION public.is_adviser_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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
        )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_adviser_of_class(UUID) TO authenticated;

-- 3. Re-apply strict RLS policies on `class_sections`
DROP POLICY IF EXISTS "Strict SELECT on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict INSERT on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict UPDATE on class_sections" ON public.class_sections;
DROP POLICY IF EXISTS "Strict DELETE on class_sections" ON public.class_sections;

CREATE POLICY "Strict SELECT on class_sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(id)
    OR public.is_parent_of_class(id)
  );

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
      )
    )
  );

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

CREATE POLICY "Strict DELETE on class_sections"
  ON public.class_sections
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(id)
  );

-- 4. Re-apply strict RLS policies on `students`
DROP POLICY IF EXISTS "Strict SELECT on students" ON public.students;
DROP POLICY IF EXISTS "Strict INSERT on students" ON public.students;
DROP POLICY IF EXISTS "Strict UPDATE on students" ON public.students;
DROP POLICY IF EXISTS "Strict DELETE on students" ON public.students;

CREATE POLICY "Strict SELECT on students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(students.section_id)
    OR public.is_parent_of_student(students.id)
  );

CREATE POLICY "Strict INSERT on students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
    OR public.is_teacher_of_class(students.section_id)
  );

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

CREATE POLICY "Strict DELETE on students"
  ON public.students
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(students.section_id)
  );

-- 5. Re-apply strict RLS policies on `attendance_sessions`
DROP POLICY IF EXISTS "Strict SELECT on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict INSERT on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict UPDATE on attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Strict DELETE on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND (
        teacher_id = (SELECT auth.uid())
        OR public.is_teacher_of_class(attendance_sessions.class_id)
      )
    )
    OR public.is_parent_of_class(attendance_sessions.class_id)
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
