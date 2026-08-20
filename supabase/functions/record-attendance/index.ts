// ==============================================================================
// Supabase Edge Function: record-attendance
// ==============================================================================
// Enforces server-side authentication, teacher authorization, enrollment check,
// duplicate protection, attendance persistence, and audit logging.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecordAttendancePayload {
  qr_payload: string;
  class_id: string;
  session_id: string;
  attendance_date: string;
  session_type: 'morning' | 'afternoon' | 'whole_day';
  status?: 'present' | 'late' | 'absent' | 'excused';
  client_event_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, status: 'unauthorized', message: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate Teacher via JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, status: 'unauthorized', message: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate Teacher Role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'unauthorized',
          message: 'Only teachers and administrators can record attendance.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RecordAttendancePayload = await req.json();
    const { qr_payload, class_id, session_id, attendance_date, session_type, status = 'present' } = body;

    // 3. Validate Teacher Class Assignment
    if (profile.role !== 'admin') {
      const { data: classSection, error: classError } = await supabase
        .from('class_sections')
        .select('id, teacher_id')
        .eq('id', class_id)
        .single();

      if (classError || !classSection || classSection.teacher_id !== user.id) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'unauthorized',
            message: 'You are not authorized to record attendance for this class.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Parse QR Payload Format
    const QR_PREFIX = 'ATTENDANCE:';
    if (!qr_payload || !qr_payload.startsWith(QR_PREFIX)) {
      return new Response(
        JSON.stringify({ success: false, status: 'invalid_qr', message: 'Invalid Student QR format.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qrIdentifier = qr_payload.slice(QR_PREFIX.length).trim();
    if (!qrIdentifier) {
      return new Response(
        JSON.stringify({ success: false, status: 'invalid_qr', message: 'Empty student QR identifier.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Resolve QR identifier to Student in database
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, lrn, first_name, last_name, middle_name, suffix, section_id')
      .eq('qr_identifier', qrIdentifier)
      .maybeSingle();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ success: false, status: 'invalid_qr', message: 'Student QR code not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Verify Enrollment in selected Class
    if (student.section_id !== class_id) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'not_enrolled',
          message: 'This student does not belong to the selected class.',
          student: {
            id: student.id,
            lrn: student.lrn,
            first_name: student.first_name,
            last_name: student.last_name,
            middle_name: student.middle_name,
            suffix: student.suffix,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Check Existing Attendance (Duplicate Prevention & Idempotency)
    const { data: existingAttendance } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student.id)
      .eq('attendance_session_id', session_id)
      .maybeSingle();

    const studentFullName = `${student.first_name} ${student.last_name}`.trim();

    if (existingAttendance) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'already_recorded',
          message: `Already Recorded: ${studentFullName} was marked ${existingAttendance.status.toUpperCase()} at ${new Date(existingAttendance.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          student: {
            id: student.id,
            lrn: student.lrn,
            first_name: student.first_name,
            last_name: student.last_name,
            middle_name: student.middle_name,
            suffix: student.suffix,
          },
          attendance: existingAttendance,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Create Attendance Record
    const newAttendance = {
      student_id: student.id,
      class_id: class_id,
      attendance_session_id: session_id,
      attendance_date: attendance_date,
      attendance_type: session_type,
      status: status,
      recorded_by: user.id,
      source: 'qr_scan',
      recorded_at: new Date().toISOString(),
    };

    const { data: attendanceRecord, error: insertError } = await supabase
      .from('attendance')
      .insert(newAttendance)
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, status: 'error', message: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. Create Audit Event
    await supabase.from('attendance_events').insert({
      attendance_id: attendanceRecord.id,
      student_id: student.id,
      teacher_id: user.id,
      event_type: 'scanned',
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'qr_scan',
        session_type: session_type,
        teacher_name: profile.full_name,
      },
    });

    const recordedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return new Response(
      JSON.stringify({
        success: true,
        status: 'recorded',
        message: `${studentFullName} marked ${status.toUpperCase()} (${recordedTime})`,
        student: {
          id: student.id,
          lrn: student.lrn,
          first_name: student.first_name,
          last_name: student.last_name,
          middle_name: student.middle_name,
          suffix: student.suffix,
        },
        attendance: attendanceRecord,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        status: 'error',
        message: err instanceof Error ? err.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
