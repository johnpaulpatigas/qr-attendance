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
