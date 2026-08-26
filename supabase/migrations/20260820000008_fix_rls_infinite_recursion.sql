-- ==============================================================================
-- Migration: Fix RLS Infinite Recursion & Security Definer Optimization
-- ==============================================================================
-- Resolves the "infinite recursion detected in policy for relation student_parents" error:
-- 1. Marks all RLS helper functions as SECURITY DEFINER with `SET search_path = public`
--    so they execute without triggering RLS recursively inside security checks.
-- 2. Eliminates circular cross-table subqueries in RLS policies for `parents`,
--    `student_parents`, `students`, `class_sections`, and `attendance_sessions`.
-- 3. Grants execute permissions to authenticated and anon roles where appropriate.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Security Definer Helper Functions
-- ------------------------------------------------------------------------------

-- Helper: Check if user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Helper: Check if user is a teacher or admin
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND (role = 'teacher' OR role = 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- Helper: Resolve current user's parent_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_parent_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.parents
  WHERE profile_id = (SELECT auth.uid())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_parent_id() TO authenticated;

-- Helper: Check if teacher teaches or advises a class section
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

-- Helper: Check if teacher is specifically the Class Adviser
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
          OR (teacher_id IS NULL AND adviser_id IS NULL)
        )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_adviser_of_class(UUID) TO authenticated;

-- Helper: Check if current auth user is a parent of a given student
CREATE OR REPLACE FUNCTION public.is_parent_of_student(target_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents sp
    JOIN public.parents p ON sp.parent_id = p.id
    WHERE sp.student_id = target_student_id
      AND p.profile_id = (SELECT auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of_student(UUID) TO authenticated;

-- Helper: Check if current auth user is a parent of any student in a class section
CREATE OR REPLACE FUNCTION public.is_parent_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_parents sp ON s.id = sp.student_id
    JOIN public.parents p ON sp.parent_id = p.id
    WHERE s.section_id = target_class_id
      AND p.profile_id = (SELECT auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of_class(UUID) TO authenticated;

-- Helper: Check if current teacher teaches a given student
CREATE OR REPLACE FUNCTION public.is_teacher_of_student(target_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = target_student_id
        AND public.is_teacher_of_class(s.section_id)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher_of_student(UUID) TO authenticated;

-- Helper: Check if current teacher teaches any student of a given parent
CREATE OR REPLACE FUNCTION public.is_teacher_of_parent(target_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.student_parents sp
      JOIN public.students s ON sp.student_id = s.id
      WHERE sp.parent_id = target_parent_id
        AND public.is_teacher_of_class(s.section_id)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher_of_parent(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Recursion-Free Policies on `parents`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can view parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can insert parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can update parents" ON public.parents;
DROP POLICY IF EXISTS "Strict SELECT on parents" ON public.parents;
DROP POLICY IF EXISTS "Strict INSERT on parents" ON public.parents;
DROP POLICY IF EXISTS "Strict UPDATE on parents" ON public.parents;
DROP POLICY IF EXISTS "Service role full access on parents" ON public.parents;

CREATE POLICY "Strict SELECT on parents"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
    OR public.is_teacher_of_parent(parents.id)
  );

CREATE POLICY "Strict INSERT on parents"
  ON public.parents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
    OR public.is_teacher()
  );

CREATE POLICY "Strict UPDATE on parents"
  ON public.parents
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY "Service role full access on parents"
  ON public.parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. Recursion-Free Policies on `student_parents`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can view student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can insert student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can update student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can delete student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Strict SELECT on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict INSERT on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict UPDATE on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict DELETE on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Service role full access on student_parents" ON public.student_parents;

CREATE POLICY "Strict SELECT on student_parents"
  ON public.student_parents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Strict INSERT on student_parents"
  ON public.student_parents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Strict UPDATE on student_parents"
  ON public.student_parents
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  )
  WITH CHECK (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Strict DELETE on student_parents"
  ON public.student_parents
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Service role full access on student_parents"
  ON public.student_parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. Recursion-Free Policies on `class_sections`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Strict SELECT on class_sections" ON public.class_sections;

CREATE POLICY "Strict SELECT on class_sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(id)
    OR public.is_parent_of_class(id)
  );

-- ------------------------------------------------------------------------------
-- 5. Recursion-Free Policies on `attendance_sessions`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Strict SELECT on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = (SELECT auth.uid())
    OR public.is_teacher_of_class(attendance_sessions.class_id)
    OR public.is_parent_of_class(attendance_sessions.class_id)
  );

-- ------------------------------------------------------------------------------
-- 6. Recursion-Free Policies on `attendance`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Strict SELECT on attendance" ON public.attendance;

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
