-- ==============================================================================
-- Migration: Create Device Tokens and Notification Logs for FCM
-- ==============================================================================

-- 1. Create Device Tokens Table
CREATE TABLE public.device_tokens (
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
CREATE TABLE public.notification_logs (
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
CREATE INDEX idx_device_tokens_profile ON public.device_tokens(profile_id);
CREATE INDEX idx_device_tokens_active ON public.device_tokens(profile_id, is_active);
CREATE INDEX idx_notification_logs_recipient ON public.notification_logs(recipient_profile_id);
CREATE INDEX idx_notification_logs_student ON public.notification_logs(student_id);
CREATE INDEX idx_notification_logs_attendance ON public.notification_logs(attendance_id);

-- 4. Enable Row Level Security
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies for device_tokens
CREATE POLICY "Users can manage own device tokens"
  ON public.device_tokens
  FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Service role full access on device_tokens"
  ON public.device_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Row Level Security Policies for notification_logs
CREATE POLICY "Users can view own notification logs"
  ON public.notification_logs
  FOR SELECT
  TO authenticated
  USING (recipient_profile_id = auth.uid() OR public.is_teacher());

CREATE POLICY "Service role full access on notification_logs"
  ON public.notification_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
