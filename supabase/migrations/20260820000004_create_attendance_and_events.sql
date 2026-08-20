-- ==============================================================================
-- Migration: Create Attendance Sessions, Attendance Records, and Audit Events
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
DROP POLICY IF EXISTS "Authenticated users can insert attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Authenticated users can update attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Teachers and admins can update attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Service role full access on attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Authenticated users can view attendance sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert attendance sessions"
  ON public.attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

CREATE POLICY "Teachers and admins can update attendance sessions"
  ON public.attendance_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on attendance_sessions"
  ON public.attendance_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Row Level Security Policies for attendance
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers and admins can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Service role full access on attendance" ON public.attendance;

CREATE POLICY "Authenticated users can view attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

CREATE POLICY "Teachers and admins can update attendance"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on attendance"
  ON public.attendance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. Row Level Security Policies for attendance_events
DROP POLICY IF EXISTS "Authenticated users can view attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Authenticated users can insert attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Teachers and admins can insert attendance events" ON public.attendance_events;
DROP POLICY IF EXISTS "Service role full access on attendance_events" ON public.attendance_events;

CREATE POLICY "Authenticated users can view attendance events"
  ON public.attendance_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can insert attendance events"
  ON public.attendance_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher());

CREATE POLICY "Service role full access on attendance_events"
  ON public.attendance_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
