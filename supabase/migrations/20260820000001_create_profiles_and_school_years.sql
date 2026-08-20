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
