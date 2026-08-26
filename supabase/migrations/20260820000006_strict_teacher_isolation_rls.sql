-- ==============================================================================
-- Migration: Strict Teacher Data Isolation & Enhanced Row Level Security (RLS)
-- ==============================================================================
-- Ensures that:
-- 1. Teachers can ONLY view, insert, update, or delete data (classes, students,
--    attendance sessions, attendance records, audit events, and parent contacts)
--    associated with their own assigned classes.
-- 2. Parents can ONLY view data for their explicitly linked children.
-- 3. Admins retain full administrative access.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper Functions (Optimized with Security Definer where necessary)
-- ------------------------------------------------------------------------------

-- Ensure is_teacher_of_class is STABLE and securely resolves teacher assignment
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_sections
    WHERE id = target_class_id AND teacher_id = (SELECT auth.uid())
  ) OR public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(UUID) TO authenticated;

-- Ensure is_parent_of_student is STABLE and resolves linked children
CREATE OR REPLACE FUNCTION public.is_parent_of_student(target_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
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

-- Ensure verify_student_lrn is SECURITY DEFINER for secure public/parent verification
CREATE OR REPLACE FUNCTION public.verify_student_lrn(target_lrn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_section TEXT;
  v_grade INTEGER;
BEGIN
  SELECT (s.first_name || ' ' || s.last_name), cs.section_name, s.grade_level
  INTO v_name, v_section, v_grade
  FROM public.students s
  LEFT JOIN public.class_sections cs ON s.section_id = cs.id
  WHERE s.lrn = target_lrn;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'student_name', v_name,
    'grade_level', v_grade,
    'section_name', v_section
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_student_lrn(TEXT) TO anon, authenticated;

-- Ensure link_student_to_parent is SECURITY DEFINER for secure linking
CREATE OR REPLACE FUNCTION public.link_student_to_parent(
  target_lrn TEXT,
  relation_name TEXT DEFAULT 'Parent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_parent_id UUID;
  v_student_name TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  SELECT id, (first_name || ' ' || last_name) INTO v_student_id, v_student_name
  FROM public.students
  WHERE lrn = target_lrn;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No enrolled student found with LRN ' || target_lrn);
  END IF;

  INSERT INTO public.parents (profile_id)
  VALUES ((SELECT auth.uid()))
  ON CONFLICT (profile_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_parent_id;

  INSERT INTO public.student_parents (student_id, parent_id, relationship, is_primary)
  VALUES (v_student_id, v_parent_id, COALESCE(relation_name, 'Parent'), true)
  ON CONFLICT (student_id, parent_id) DO UPDATE SET relationship = EXCLUDED.relationship;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Student ' || v_student_name || ' successfully linked to your account.',
    'student_id', v_student_id,
    'student_name', v_student_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_student_to_parent(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Strict RLS Policies for `class_sections`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Authenticated users can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can insert class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can update class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can delete class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Service role full access on class_sections" ON public.class_sections;

-- SELECT: Teachers see only assigned classes; Parents/Students see only classes of linked children; Admins see all
CREATE POLICY "Strict SELECT on class_sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_parents sp ON s.id = sp.student_id
      JOIN public.parents p ON sp.parent_id = p.id
      WHERE s.section_id = class_sections.id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

-- INSERT: Teachers can only insert classes assigned to themselves; Admins can insert any
CREATE POLICY "Strict INSERT on class_sections"
  ON public.class_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
  );

-- UPDATE: Teachers can only update their own assigned classes; Admins can update any
CREATE POLICY "Strict UPDATE on class_sections"
  ON public.class_sections
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
  );

-- DELETE: Teachers can only delete their own assigned classes; Admins can delete any
CREATE POLICY "Strict DELETE on class_sections"
  ON public.class_sections
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
  );

CREATE POLICY "Service role full access on class_sections"
  ON public.class_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. Strict RLS Policies for `students`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can insert students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can update students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can delete students" ON public.students;
DROP POLICY IF EXISTS "Service role full access on students" ON public.students;

-- SELECT: Teachers see only students in their assigned classes; Parents see only their linked children; Admins see all
CREATE POLICY "Strict SELECT on students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = students.section_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
    OR public.is_parent_of_student(students.id)
  );

-- INSERT: Teachers can only insert students into classes assigned to them; Admins can insert any
CREATE POLICY "Strict INSERT on students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = students.section_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- UPDATE: Teachers can only update students in classes assigned to them; Admins can update any
CREATE POLICY "Strict UPDATE on students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = students.section_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = students.section_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE: Teachers can only delete students from classes assigned to them; Admins can delete any
CREATE POLICY "Strict DELETE on students"
  ON public.students
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = students.section_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Service role full access on students"
  ON public.students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. Strict RLS Policies for `attendance_sessions`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers and admins can update attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers and admins can delete attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Service role full access on attendance_sessions" ON public.attendance_sessions;

-- SELECT: Teachers see only sessions for their classes; Parents see sessions for their children's classes; Admins see all
CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND (
        teacher_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.class_sections cs
          WHERE cs.id = attendance_sessions.class_id
            AND cs.teacher_id = (SELECT auth.uid())
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_parents sp ON s.id = sp.student_id
      JOIN public.parents p ON sp.parent_id = p.id
      WHERE s.section_id = attendance_sessions.class_id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

-- INSERT: Teachers can only create sessions for classes assigned to them; Admins can create any
CREATE POLICY "Strict INSERT on attendance_sessions"
  ON public.attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND teacher_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance_sessions.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- UPDATE: Teachers can only update sessions for their assigned classes; Admins can update any
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
        OR EXISTS (
          SELECT 1 FROM public.class_sections cs
          WHERE cs.id = attendance_sessions.class_id
            AND cs.teacher_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (
        teacher_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.class_sections cs
          WHERE cs.id = attendance_sessions.class_id
            AND cs.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

-- DELETE: Teachers can only delete sessions for their assigned classes; Admins can delete any
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
        OR EXISTS (
          SELECT 1 FROM public.class_sections cs
          WHERE cs.id = attendance_sessions.class_id
            AND cs.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY "Service role full access on attendance_sessions"
  ON public.attendance_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. Strict RLS Policies for `attendance`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers and admins can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers and admins can delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "Service role full access on attendance" ON public.attendance;

-- SELECT: Teachers see only attendance for their classes; Parents see only their children's attendance; Admins see all
CREATE POLICY "Strict SELECT on attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
    OR public.is_parent_of_student(attendance.student_id)
  );

-- INSERT: Teachers can only record attendance for their assigned classes; Admins can record any
CREATE POLICY "Strict INSERT on attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND recorded_by = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- UPDATE: Teachers can only correct attendance for their assigned classes; Admins can update any
CREATE POLICY "Strict UPDATE on attendance"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE: Teachers can only delete attendance for their assigned classes; Admins can delete any
CREATE POLICY "Strict DELETE on attendance"
  ON public.attendance
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.class_sections cs
        WHERE cs.id = attendance.class_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Service role full access on attendance"
  ON public.attendance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. Strict RLS Policies for `attendance_events`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Service role full access on attendance_events" ON public.attendance_events;

-- SELECT: Teachers see only events for students in their assigned classes; Parents see events for linked children; Admins see all
CREATE POLICY "Strict SELECT on attendance_events"
  ON public.attendance_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = attendance_events.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
    OR public.is_parent_of_student(attendance_events.student_id)
  );

-- INSERT: Teachers can record events for their sessions; Admins can insert any
CREATE POLICY "Strict INSERT on attendance_events"
  ON public.attendance_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND teacher_id = (SELECT auth.uid()))
  );

CREATE POLICY "Service role full access on attendance_events"
  ON public.attendance_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. Strict RLS Policies for `parents` and `student_parents`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can insert parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can update parents" ON public.parents;
DROP POLICY IF EXISTS "Service role full access on parents" ON public.parents;

-- SELECT on parents: Only own parent record, or parents of students in assigned class, or admin
CREATE POLICY "Strict SELECT on parents"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.student_parents sp
        JOIN public.students s ON sp.student_id = s.id
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE sp.parent_id = parents.id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
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

DROP POLICY IF EXISTS "Authenticated users can view student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can insert student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can update student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can delete student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Service role full access on student_parents" ON public.student_parents;

-- SELECT on student_parents: Only own links, or links for students in assigned classes, or admin
CREATE POLICY "Strict SELECT on student_parents"
  ON public.student_parents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id
        AND p.profile_id = (SELECT auth.uid())
    )
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = student_parents.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Strict INSERT on student_parents"
  ON public.student_parents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id
        AND p.profile_id = (SELECT auth.uid())
    )
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = student_parents.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Strict UPDATE on student_parents"
  ON public.student_parents
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id
        AND p.profile_id = (SELECT auth.uid())
    )
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = student_parents.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id
        AND p.profile_id = (SELECT auth.uid())
    )
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = student_parents.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Strict DELETE on student_parents"
  ON public.student_parents
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id
        AND p.profile_id = (SELECT auth.uid())
    )
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.class_sections cs ON s.section_id = cs.id
        WHERE s.id = student_parents.student_id
          AND cs.teacher_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Service role full access on student_parents"
  ON public.student_parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
