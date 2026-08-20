-- ==============================================================================
-- Migration: Create Students, Parents, and Student-Parent Relationships
-- ==============================================================================

-- 1. Create Students Table
CREATE TABLE public.students (
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
CREATE TABLE public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_information JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Student-Parents Relationship Table
CREATE TABLE public.student_parents (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Parent',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, parent_id)
);

-- 4. Indexes for fast query and lookup
CREATE INDEX idx_students_section ON public.students(section_id);
CREATE INDEX idx_students_school_year ON public.students(school_year_id);
CREATE INDEX idx_students_qr_identifier ON public.students(qr_identifier);
CREATE INDEX idx_students_lrn ON public.students(lrn);
CREATE INDEX idx_student_parents_parent ON public.student_parents(parent_id);
CREATE INDEX idx_student_parents_student ON public.student_parents(student_id);

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
      AND p.profile_id = auth.uid()
  );
$$;

-- 7. Row Level Security Policies for students
-- Teachers and admins can view students
CREATE POLICY "Teachers and admins can view students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (public.is_teacher() OR public.is_parent_of_student(id));

-- Teachers and admins can insert students
CREATE POLICY "Teachers and admins can insert students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

-- Teachers and admins can update students
CREATE POLICY "Teachers and admins can update students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

-- Service role full access
CREATE POLICY "Service role full access on students"
  ON public.students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Row Level Security Policies for parents
CREATE POLICY "Parents can view own parent record"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_teacher());

CREATE POLICY "Parents can update own parent record"
  ON public.parents
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Teachers and admins can manage parents"
  ON public.parents
  FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on parents"
  ON public.parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. Row Level Security Policies for student_parents
CREATE POLICY "Parents and teachers can view student parent links"
  ON public.student_parents
  FOR SELECT
  TO authenticated
  USING (
    public.is_teacher() OR
    EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = student_parents.parent_id AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "Teachers and admins can manage student parent links"
  ON public.student_parents
  FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on student_parents"
  ON public.student_parents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
