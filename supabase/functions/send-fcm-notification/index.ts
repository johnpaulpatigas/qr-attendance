import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendFcmRequest {
  student_id: string;
  attendance_id: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  recorded_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: SendFcmRequest = await req.json();
    const { student_id, attendance_id, status, recorded_at } = body;

    if (!student_id || !attendance_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing student_id or attendance_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, first_name, last_name, lrn')
      .eq('id', student_id)
      .single();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ success: false, message: 'Student not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const studentFullName = `${student.first_name} ${student.last_name}`;
    const timeFormatted = new Date(recorded_at || Date.now()).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    let title = 'Attendance Update';
    let bodyText = `${studentFullName} was marked ${status.toUpperCase()} at ${timeFormatted}.`;
    let notifType = 'attendance_present';

    if (status === 'late') {
      title = 'Attendance Alert: Late Arrival';
      bodyText = `${studentFullName} arrived LATE to class at ${timeFormatted}.`;
      notifType = 'attendance_late';
    } else if (status === 'absent') {
      title = 'Attendance Notice: Absence';
      bodyText = `${studentFullName} was marked ABSENT for today.`;
      notifType = 'attendance_absent';
    }

    const { data: parentLinks } = await supabase
      .from('student_parents')
      .select('parent_id, parents(profile_id)')
      .eq('student_id', student_id);

    const recipientProfileIds: string[] = [];

    if (parentLinks && Array.isArray(parentLinks)) {
      parentLinks.forEach((link: { parents?: { profile_id?: string } | null }) => {
        if (link.parents?.profile_id) {
          recipientProfileIds.push(link.parents.profile_id);
        }
      });
    }

    let tokenQuery = supabase
      .from('device_tokens')
      .select('profile_id, fcm_token')
      .eq('is_active', true);

    if (recipientProfileIds.length > 0) {
      tokenQuery = tokenQuery.or(
        `student_id.eq.${student_id},profile_id.in.(${recipientProfileIds.join(',')})`
      );
    } else {
      tokenQuery = tokenQuery.eq('student_id', student_id);
    }

    const { data: tokens } = await tokenQuery;

    let sentCount = 0;
    let failedCount = 0;

    if (tokens && tokens.length > 0) {
      for (const tokenItem of tokens) {
        try {
          if (fcmServerKey) {
            const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `key=${fcmServerKey}`,
              },
              body: JSON.stringify({
                to: tokenItem.fcm_token,
                notification: {
                  title,
                  body: bodyText,
                },
                data: {
                  student_id,
                  attendance_id,
                  status,
                  type: notifType,
                  timestamp: recorded_at,
                },
              }),
            });

            if (!fcmResponse.ok) {
              throw new Error(`FCM HTTP ${fcmResponse.status}`);
            }
          }

          await supabase.from('notification_logs').insert({
            recipient_profile_id: tokenItem.profile_id,
            student_id: student_id,
            attendance_id: attendance_id,
            notification_type: notifType,
            status: 'sent',
            fcm_token: tokenItem.fcm_token,
            sent_at: new Date().toISOString(),
          });

          sentCount++;
        } catch (dispatchErr: unknown) {
          failedCount++;
          await supabase.from('notification_logs').insert({
            recipient_profile_id: tokenItem.profile_id,
            student_id: student_id,
            attendance_id: attendance_id,
            notification_type: notifType,
            status: 'failed',
            fcm_token: tokenItem.fcm_token,
            error_message: dispatchErr instanceof Error ? dispatchErr.message : 'FCM Dispatch failed',
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        recipients: tokens ? tokens.length : 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : 'Internal notification error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
