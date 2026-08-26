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
  session_type: 'morning' | 'afternoon';
  status?: 'present' | 'late' | 'absent' | 'excused';
  client_event_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'unauthorized',
          message: 'Missing Authorization header',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'unauthorized',
          message: 'Invalid authentication token',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const {
      qr_payload,
      class_id,
      session_id,
      attendance_date,
      session_type,
      status = 'present',
      subject_name,
    } = body;

    if (profile.role !== 'admin') {
      const { data: classSection, error: classError } = await supabase
        .from('class_sections')
        .select('id, teacher_id, adviser_id')
        .eq('id', class_id)
        .single();

      const isAdviser = Boolean(
        classSection &&
        (classSection.teacher_id === user.id ||
          classSection.adviser_id === user.id ||
          (!classSection.teacher_id && !classSection.adviser_id))
      );

      let isSubjectTeacher = false;
      if (!isAdviser) {
        const { data: subjectAssignment } = await supabase
          .from('section_subject_teachers')
          .select('id')
          .eq('class_id', class_id)
          .eq('teacher_id', user.id)
          .limit(1)
          .maybeSingle();

        isSubjectTeacher = Boolean(subjectAssignment);
      }

      if (classError || (!isAdviser && !isSubjectTeacher)) {
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

    const QR_PREFIX = 'ATTENDANCE:';
    if (!qr_payload || !qr_payload.startsWith(QR_PREFIX)) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'invalid_qr',
          message: 'Invalid Student QR format.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qrIdentifier = qr_payload.slice(QR_PREFIX.length).trim();
    if (!qrIdentifier) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'invalid_qr',
          message: 'Empty student QR identifier.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, lrn, first_name, last_name, middle_name, suffix, section_id')
      .eq('qr_identifier', qrIdentifier)
      .maybeSingle();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'invalid_qr',
          message: 'Student QR code not found in database.',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (student.section_id !== class_id) {
      const { data: actualSec } = await supabase
        .from('class_sections')
        .select('grade_level, section_name')
        .eq('id', student.section_id)
        .maybeSingle();

      const cleanActualSec = actualSec?.section_name
        ? actualSec.section_name
            .replace(/^(?:grade\s*\d+|gr\.\s*\d+|g\d+|\d+)\s*[-—–:]?\s*/i, '')
            .trim() || actualSec.section_name
        : '';
      const actualSecName = actualSec
        ? `Grade ${actualSec.grade_level} — ${cleanActualSec}`
        : 'another class section';
      const studentFullName = `${student.first_name} ${student.last_name}`.trim();

      return new Response(
        JSON.stringify({
          success: false,
          status: 'not_enrolled',
          message: `Student Not Enrolled: ${studentFullName} is enrolled in ${actualSecName}.`,
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

    const newAttendance = {
      student_id: student.id,
      class_id: class_id,
      attendance_session_id: session_id,
      attendance_date: attendance_date,
      attendance_type: session_type,
      subject_name: subject_name || null,
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

    try {
      supabase.functions
        .invoke('send-fcm-notification', {
          body: {
            student_id: student.id,
            attendance_id: attendanceRecord.id,
            status: status,
            recorded_at: attendanceRecord.recorded_at,
          },
        })
        .catch((e: Error) => console.warn('Background FCM dispatch non-blocking error:', e));
    } catch {
      // Non-blocking notification dispatch
    }

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
