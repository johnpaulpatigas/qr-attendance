-- ==============================================================================
-- Combined Supabase Schema & Migration File
-- ==============================================================================

-- ==============================================================================
-- 1. Create User Roles, Profiles, and School Years
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('teacher', 'admin', 'parent', 'student');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Profiles Table (References auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'teacher',
  full_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create School Years Table
CREATE TABLE IF NOT EXISTS public.school_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- e.g. '2026-2027'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_school_year_dates CHECK (end_date > start_date)
);

-- 4. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;

-- 5. Grant schema and table permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 6. Helper Functions for RLS (Stable Security Invoker functions)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (public.get_current_user_role() = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (public.get_current_user_role() IN ('teacher', 'admin'));
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- 7. Row Level Security Policies for profiles
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access on profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Service role full access on profiles"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Row Level Security Policies for school_years
DROP POLICY IF EXISTS "Authenticated users can view school years" ON public.school_years;
DROP POLICY IF EXISTS "Teachers and admins can insert school years" ON public.school_years;
DROP POLICY IF EXISTS "Teachers and admins can update school years" ON public.school_years;
DROP POLICY IF EXISTS "Service role full access on school_years" ON public.school_years;

CREATE POLICY "Authenticated users can view school years"
  ON public.school_years
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert school years"
  ON public.school_years
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

CREATE POLICY "Teachers and admins can update school years"
  ON public.school_years
  FOR UPDATE
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on school_years"
  ON public.school_years
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. Auto-create Profile and Auto-link Student on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_lrn TEXT;
  v_relation TEXT;
  v_student_id UUID;
  v_parent_id UUID;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'teacher'::public.user_role);
  v_lrn := NEW.raw_user_meta_data->>'student_lrn';
  v_relation := COALESCE(NEW.raw_user_meta_data->>'relationship', 'Parent');

  -- 1. Insert or update Profile
  INSERT INTO public.profiles (id, role, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- 2. If student_lrn is supplied in metadata from parent signup, link atomically!
  IF v_lrn IS NOT NULL THEN
    SELECT id INTO v_student_id FROM public.students WHERE lrn = v_lrn;

    IF v_student_id IS NOT NULL THEN
      -- Create parent row
      INSERT INTO public.parents (profile_id)
      VALUES (NEW.id)
      ON CONFLICT (profile_id) DO UPDATE SET updated_at = NOW()
      RETURNING id INTO v_parent_id;

      -- Create student_parents link
      INSERT INTO public.student_parents (student_id, parent_id, relationship, is_primary)
      VALUES (v_student_id, v_parent_id, v_relation, true)
      ON CONFLICT (student_id, parent_id) DO UPDATE SET relationship = EXCLUDED.relationship;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 2. Create Class Sections Table and RLS Policies
-- ==============================================================================

-- 1. Create class_sections Table
CREATE TABLE IF NOT EXISTS public.class_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  section_name TEXT NOT NULL,
  room_number TEXT,
  school_year_id UUID NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_class_section_per_school_year UNIQUE (grade_level, section_name, school_year_id)
);

ALTER TABLE public.class_sections ADD COLUMN IF NOT EXISTS room_number TEXT;

-- 2. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_class_sections_school_year ON public.class_sections(school_year_id);
CREATE INDEX IF NOT EXISTS idx_class_sections_teacher ON public.class_sections(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_sections_grade ON public.class_sections(grade_level);

-- 3. Enable Row Level Security
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;

-- 4. Helper Function: Is Teacher Assigned to Class (Stable Security Invoker)
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

-- 5. Row Level Security Policies
DROP POLICY IF EXISTS "Authenticated users can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Anyone can view class sections" ON public.class_sections;
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

-- ==============================================================================
-- 3. Create Students, Parents, and Student-Parent Relationships
-- ==============================================================================

-- 1. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lrn VARCHAR(12) NOT NULL,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  suffix TEXT,
  sex VARCHAR(6) NOT NULL CHECK (sex IN ('MALE', 'FEMALE')),
  birth_date DATE NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
  school_year_id UUID NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  qr_identifier TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_lrn_per_school_year UNIQUE (lrn, school_year_id),
  CONSTRAINT chk_lrn_format CHECK (lrn ~ '^\d{12}$')
);

-- 2. Create Parents Table
CREATE TABLE IF NOT EXISTS public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_information JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Student-Parents Relationship Table
CREATE TABLE IF NOT EXISTS public.student_parents (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Parent',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, parent_id)
);

-- 4. Indexes for fast query and lookup
CREATE INDEX IF NOT EXISTS idx_students_section ON public.students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_school_year ON public.students(school_year_id);
CREATE INDEX IF NOT EXISTS idx_students_qr_identifier ON public.students(qr_identifier);
CREATE INDEX IF NOT EXISTS idx_students_lrn ON public.students(lrn);
CREATE INDEX IF NOT EXISTS idx_student_parents_parent ON public.student_parents(parent_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_student ON public.student_parents(student_id);

-- 5. Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;

-- 6. Helper Functions for Student Access (Stable Security Invoker)
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

-- 7. Public Function to verify LRN existence (SECURITY INVOKER for clean security compliance)
CREATE OR REPLACE FUNCTION public.verify_student_lrn(target_lrn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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

-- 8. Zero-Friction RPC: Link Student to Authenticated Parent Account (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.link_student_to_parent(
  target_lrn TEXT,
  relation_name TEXT DEFAULT 'Parent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_parent_id UUID;
  v_student_name TEXT;
BEGIN
  -- 1. Verify user is authenticated
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  -- 2. Find student by LRN
  SELECT id, (first_name || ' ' || last_name) INTO v_student_id, v_student_name
  FROM public.students
  WHERE lrn = target_lrn;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No enrolled student found with LRN ' || target_lrn);
  END IF;

  -- 3. Ensure parent record exists for auth.uid()
  INSERT INTO public.parents (profile_id)
  VALUES ((SELECT auth.uid()))
  ON CONFLICT (profile_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_parent_id;

  -- 4. Create or update student_parents link
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

-- 9. Row Level Security Policies for students
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Anyone can view students" ON public.students;
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

-- 10. Row Level Security Policies for parents
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

-- ==============================================================================
-- 4. Create Attendance Sessions, Attendance Records, and Audit Events
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE public.session_type AS ENUM ('morning', 'afternoon');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'excused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_source AS ENUM ('qr_scan', 'manual', 'import', 'correction');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_event_type AS ENUM (
    'scanned',
    'marked_present',
    'marked_late',
    'marked_absent',
    'marked_excused',
    'corrected',
    'deleted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Attendance Sessions Table
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  session_type public.session_type NOT NULL DEFAULT 'morning',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_session_per_class_date_type UNIQUE (class_id, attendance_date, session_type)
);

-- 3. Create Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  attendance_session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  attendance_type public.session_type NOT NULL DEFAULT 'morning',
  status public.attendance_status NOT NULL DEFAULT 'present',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source public.attendance_source NOT NULL DEFAULT 'qr_scan',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attendance_student_session UNIQUE (student_id, attendance_session_id),
  CONSTRAINT uq_attendance_student_date_type UNIQUE (student_id, attendance_date, attendance_type)
);

-- 4. Create Attendance Events Audit Table
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type public.attendance_event_type NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_date ON public.attendance_sessions(class_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class ON public.attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_attendance ON public.attendance_events(attendance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_student ON public.attendance_events(student_id);

-- 6. Enable Row Level Security
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

-- 7. Row Level Security Policies for attendance_sessions
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

-- 8. Row Level Security Policies for attendance
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

-- 9. Row Level Security Policies for attendance_events
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

-- ==============================================================================
-- 5. Create Device Tokens and Notification Logs for FCM
-- ==============================================================================

-- 1. Create Device Tokens Table
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.parents(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios')),
  device_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Notification Logs Table
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_id UUID NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL DEFAULT 'attendance_present'
    CHECK (notification_type IN ('attendance_present', 'attendance_late', 'attendance_absent', 'general')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  fcm_token TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for fast token lookup and delivery reporting
CREATE INDEX IF NOT EXISTS idx_device_tokens_profile ON public.device_tokens(profile_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON public.device_tokens(profile_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON public.notification_logs(recipient_profile_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_student ON public.notification_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_attendance ON public.notification_logs(attendance_id);

-- 4. Enable Row Level Security
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies for device_tokens (Single policy per action, InitPlan optimized)
DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Authenticated users can manage device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Service role full access on device_tokens" ON public.device_tokens;

CREATE POLICY "Authenticated users can manage device tokens"
  ON public.device_tokens
  FOR ALL
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "Service role full access on device_tokens"
  ON public.device_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Row Level Security Policies for notification_logs (Single policy per action, InitPlan optimized)
DROP POLICY IF EXISTS "Users can view own notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Authenticated users can view notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Service role full access on notification_logs" ON public.notification_logs;

CREATE POLICY "Authenticated users can view notification logs"
  ON public.notification_logs
  FOR SELECT
  TO authenticated
  USING (recipient_profile_id = (SELECT auth.uid()) OR public.is_teacher());

CREATE POLICY "Service role full access on notification_logs"
  ON public.notification_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==============================================================================
-- 7. High School Multi-Subject Teachers & Section Subject Assignments
-- ==============================================================================
ALTER TABLE public.class_sections ADD COLUMN IF NOT EXISTS adviser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);

CREATE TABLE IF NOT EXISTS public.section_subject_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  subject_name VARCHAR(100) NOT NULL,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_section_subject_teacher UNIQUE (class_id, subject_name, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_class ON public.section_subject_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_teacher ON public.section_subject_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_subject ON public.section_subject_teachers(subject_name);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_subject ON public.attendance_sessions(class_id, attendance_date, subject_name);
CREATE INDEX IF NOT EXISTS idx_attendance_subject ON public.attendance(student_id, attendance_date, subject_name);

ALTER TABLE public.section_subject_teachers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.is_adviser_of_class(target_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
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

DROP POLICY IF EXISTS "Strict SELECT on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict INSERT on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict UPDATE on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Strict DELETE on section_subject_teachers" ON public.section_subject_teachers;
DROP POLICY IF EXISTS "Service role full access on section_subject_teachers" ON public.section_subject_teachers;

CREATE POLICY "Strict SELECT on section_subject_teachers"
  ON public.section_subject_teachers FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = (SELECT auth.uid())
    OR public.is_teacher_of_class(class_id)
  );

CREATE POLICY "Strict INSERT on section_subject_teachers"
  ON public.section_subject_teachers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  );

CREATE POLICY "Strict UPDATE on section_subject_teachers"
  ON public.section_subject_teachers FOR UPDATE TO authenticated
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

CREATE POLICY "Strict DELETE on section_subject_teachers"
  ON public.section_subject_teachers FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_class(class_id)
    OR teacher_id = (SELECT auth.uid())
  );

CREATE POLICY "Service role full access on section_subject_teachers"
  ON public.section_subject_teachers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- Migration 08: Fix RLS Infinite Recursion & Security Definer Optimization
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND (role = 'teacher' OR role = 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_parent_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.parents
  WHERE profile_id = (SELECT auth.uid())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_parent_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.is_adviser_of_class(target_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.is_parent_of_student(target_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents sp
    JOIN public.parents p ON sp.parent_id = p.id
    WHERE sp.student_id = target_student_id
      AND p.profile_id = (SELECT auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of_student(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_parent_of_class(target_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_parents sp ON s.id = sp.student_id
    JOIN public.parents p ON sp.parent_id = p.id
    WHERE s.section_id = target_class_id
      AND p.profile_id = (SELECT auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of_class(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(target_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.is_teacher_of_parent(target_parent_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Policies for parents
DROP POLICY IF EXISTS "Strict SELECT on parents" ON public.parents;
CREATE POLICY "Strict SELECT on parents"
  ON public.parents FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR profile_id = (SELECT auth.uid())
    OR public.is_teacher_of_parent(parents.id)
  );

-- Policies for student_parents
DROP POLICY IF EXISTS "Strict SELECT on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict INSERT on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict UPDATE on student_parents" ON public.student_parents;
DROP POLICY IF EXISTS "Strict DELETE on student_parents" ON public.student_parents;

CREATE POLICY "Strict SELECT on student_parents"
  ON public.student_parents FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Strict INSERT on student_parents"
  ON public.student_parents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

CREATE POLICY "Strict UPDATE on student_parents"
  ON public.student_parents FOR UPDATE TO authenticated
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
  ON public.student_parents FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR parent_id = public.get_my_parent_id()
    OR public.is_teacher_of_student(student_parents.student_id)
  );

-- Policies for class_sections
DROP POLICY IF EXISTS "Strict SELECT on class_sections" ON public.class_sections;
CREATE POLICY "Strict SELECT on class_sections"
  ON public.class_sections FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_of_class(id)
    OR public.is_parent_of_class(id)
  );

-- Policies for attendance_sessions
DROP POLICY IF EXISTS "Strict SELECT on attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Strict SELECT on attendance_sessions"
  ON public.attendance_sessions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = (SELECT auth.uid())
    OR public.is_teacher_of_class(attendance_sessions.class_id)
    OR public.is_parent_of_class(attendance_sessions.class_id)
  );

-- Policies for attendance
DROP POLICY IF EXISTS "Strict SELECT on attendance" ON public.attendance;
CREATE POLICY "Strict SELECT on attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR recorded_by = (SELECT auth.uid())
    OR public.is_teacher_of_class(attendance.class_id)
    OR public.is_parent_of_student(attendance.student_id)
  );

