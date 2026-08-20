-- ==============================================================================
-- Migration: Create Class Sections Table and RLS Policies
-- ==============================================================================

-- 1. Create class_sections Table
CREATE TABLE public.class_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  section_name TEXT NOT NULL,
  school_year_id UUID NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_class_section_per_school_year UNIQUE (grade_level, section_name, school_year_id)
);

-- 2. Indexes for fast lookup
CREATE INDEX idx_class_sections_school_year ON public.class_sections(school_year_id);
CREATE INDEX idx_class_sections_teacher ON public.class_sections(teacher_id);
CREATE INDEX idx_class_sections_grade ON public.class_sections(grade_level);

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
    WHERE id = target_class_id AND teacher_id = auth.uid()
  ) OR public.is_admin();
$$;

-- 5. Row Level Security Policies
-- Authenticated users (teachers, parents, students) can view class information
CREATE POLICY "Authenticated users can view class sections"
  ON public.class_sections
  FOR SELECT
  TO authenticated
  USING (true);

-- Teachers assigned to the section or Admins can update class details
CREATE POLICY "Assigned teachers and admins can update class section"
  ON public.class_sections
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

-- Only Admins and authorized Teachers can insert new class sections
CREATE POLICY "Teachers and admins can insert class sections"
  ON public.class_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

-- Service role full access
CREATE POLICY "Service role full access on class_sections"
  ON public.class_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
