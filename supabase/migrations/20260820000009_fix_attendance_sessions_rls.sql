-- ==============================================================================
-- Migration: Fix Attendance Sessions RLS Policy
-- ==============================================================================
-- Ensures any authenticated teacher can create and view attendance sessions
-- for any active school class section without RLS insertion rejections.
-- ==============================================================================

DROP POLICY IF EXISTS "Strict INSERT on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Strict INSERT on attendance_sessions"
  ON public.attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND teacher_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Strict SELECT on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher()
    OR public.is_parent_of_class(attendance_sessions.class_id)
  );
