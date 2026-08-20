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
DROP POLICY IF EXISTS "Service role full access on class_sections" ON public.class_sections;

CREATE POLICY "Anyone can view class sections"
  ON public.class_sections
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert class sections"
  ON public.class_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

CREATE POLICY "Teachers and admins can update class sections"
  ON public.class_sections
  FOR UPDATE
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on class_sections"
  ON public.class_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
