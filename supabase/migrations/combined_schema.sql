-- ==============================================================================
-- Migration: Create User Roles, Profiles, and School Years
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

-- 6. Helper Functions for RLS (SECURITY DEFINER runs as database owner, bypassing RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_current_user_role() = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_current_user_role() IN ('teacher', 'admin'));
$$;

-- 7. Row Level Security Policies for profiles (Single permissive policy per action, InitPlan optimized)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Teachers and admins can view profiles" ON public.profiles;
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

-- 8. Row Level Security Policies for school_years (Single permissive policy per action)
DROP POLICY IF EXISTS "Authenticated users can view school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can manage school years" ON public.school_years;
DROP POLICY IF EXISTS "Teachers and admins can manage school years" ON public.school_years;
DROP POLICY IF EXISTS "Authenticated users can insert school years" ON public.school_years;
DROP POLICY IF EXISTS "Authenticated users can update school years" ON public.school_years;
DROP POLICY IF EXISTS "Service role full access on school_years" ON public.school_years;

CREATE POLICY "Authenticated users can view school years"
  ON public.school_years
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert school years"
  ON public.school_years
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update school years"
  ON public.school_years
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

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

  -- 2. If student_lrn is supplied in metadata (e.g. from parent signup), link atomically!
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
-- ==============================================================================
-- Migration: Create Class Sections Table and RLS Policies
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

-- 4. Helper Function: Is Teacher Assigned to Class
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_sections
    WHERE id = target_class_id AND teacher_id = (SELECT auth.uid())
  ) OR public.is_admin();
$$;

-- 5. Row Level Security Policies (Single consolidated policy per action)
DROP POLICY IF EXISTS "Authenticated users can view class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Assigned teachers and admins can update class section" ON public.class_sections;
DROP POLICY IF EXISTS "Teachers and admins can insert class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Authenticated users can insert class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Authenticated users can update class sections" ON public.class_sections;
DROP POLICY IF EXISTS "Service role full access on class_sections" ON public.class_sections;

CREATE POLICY "Authenticated users can view class sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert class sections"
  ON public.class_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update class sections"
  ON public.class_sections
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on class_sections"
  ON public.class_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- ==============================================================================
-- Migration: Create Students, Parents, and Student-Parent Relationships
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

-- 6. Helper Functions for Student Access
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

-- 7. Public Function to verify LRN existence (Can be called anonymously during sign up)
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

-- 8. Zero-Friction RPC: Link Student to Authenticated Parent Account
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

GRANT EXECUTE ON FUNCTION public.link_student_to_parent(TEXT, TEXT) TO authenticated, anon;

-- 9. Row Level Security Policies for students (Single consolidated policy per action)
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can insert students" ON public.students;
DROP POLICY IF EXISTS "Teachers and admins can update students" ON public.students;
DROP POLICY IF EXISTS "Service role full access on students" ON public.students;

CREATE POLICY "Authenticated users can view students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Teachers and admins can update students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on students"
  ON public.students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 10. Row Level Security Policies for parents (Single consolidated policy per action, InitPlan optimized)
DROP POLICY IF EXISTS "Parents can view own parent record" ON public.parents;
DROP POLICY IF EXISTS "Parents can insert own parent record" ON public.parents;
DROP POLICY IF EXISTS "Parents can update own parent record" ON public.parents;
DROP POLICY IF EXISTS "Teachers and admins can manage parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can view parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can insert parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can update parents" ON public.parents;
DROP POLICY IF EXISTS "Service role full access on parents" ON public.parents;

CREATE POLICY "Authenticated users can view parents"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_teacher());

CREATE POLICY "Authenticated users can insert parents"
  ON public.parents
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_teacher());

CREATE POLICY "Authenticated users can update parents"
  ON public.parents
  FOR UPDATE
  TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_teacher())
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_teacher());

CREATE POLICY "Service role full access on parents"
  ON public.parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 11. Row Level Security Policies for student_parents (Single consolidated policy per action)
DROP POLICY IF EXISTS "Parents and teachers can view student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Parents can manage own student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Teachers and admins can manage student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can view student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Authenticated users can manage student parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Service role full access on student_parents" ON public.student_parents;

CREATE POLICY "Authenticated users can view student parent links"
  ON public.student_parents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage student parent links"
  ON public.student_parents
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on student_parents"
  ON public.student_parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- ==============================================================================
-- Migration: Create Attendance Sessions, Attendance Records, and Audit Events
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE public.session_type AS ENUM ('morning', 'afternoon', 'whole_day');
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

-- 7. Row Level Security Policies for attendance_sessions (Single consolidated policy per action)
DROP POLICY IF EXISTS "Authenticated users can view attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers can insert attendance sessions for assigned classes" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers can update attendance sessions for assigned classes" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Authenticated users can insert attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Authenticated users can update attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Service role full access on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Authenticated users can view attendance sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert attendance sessions"
  ON public.attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update attendance sessions"
  ON public.attendance_sessions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on attendance_sessions"
  ON public.attendance_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Row Level Security Policies for attendance (Single consolidated policy per action)
DROP POLICY IF EXISTS "Teachers can view class attendance and parents can view child attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Service role full access on attendance" ON public.attendance;

CREATE POLICY "Authenticated users can view attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update attendance"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on attendance"
  ON public.attendance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. Row Level Security Policies for attendance_events (Single consolidated policy per action)
DROP POLICY IF EXISTS "Teachers and parents can view attendance audit events" ON public.attendance_events;
DROP POLICY IF EXISTS "Teachers can insert attendance audit events" ON public.attendance_events;
DROP POLICY IF EXISTS "Authenticated users can view attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Authenticated users can insert attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Service role full access on attendance_events" ON public.attendance_events;

CREATE POLICY "Authenticated users can view attendance events"
  ON public.attendance_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert attendance events"
  ON public.attendance_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role full access on attendance_events"
  ON public.attendance_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- ==============================================================================
-- Migration: Create Device Tokens and Notification Logs for FCM
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
