import { getSupabaseClient } from '@qr-attendance/supabase';
import type { RecordAttendancePayload, RecordAttendanceResponse } from '@qr-attendance/types';
import { parseQrPayload } from '@qr-attendance/validation';

interface StudentQueryResult {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  section_id: string;
}

export async function submitAttendanceScan(
  payload: RecordAttendancePayload
): Promise<RecordAttendanceResponse> {
  const client = getSupabaseClient();

  // Validate format before dispatching
  const parsedQr = parseQrPayload(payload.qr_payload);
  if (!parsedQr.success || !parsedQr.identifier) {
    return {
      success: false,
      status: 'invalid_qr',
      message: 'Invalid student QR code format.',
    };
  }

  try {
    // 1. Attempt invoking Supabase Edge Function
    const { data, error } = await client.functions.invoke<RecordAttendanceResponse>(
      'record-attendance',
      {
        body: payload,
      }
    );

    if (!error && data) {
      return data;
    }
  } catch {
    // Fall back to direct database insertion
  }

  try {
    // 2. Query real student from database
    const { data: studentData, error: studentError } = await client
      .from('students')
      .select('id, lrn, first_name, last_name, middle_name, suffix, section_id')
      .or(`qr_identifier.eq.${parsedQr.identifier},id.eq.${parsedQr.identifier}`)
      .maybeSingle();

    if (studentError || !studentData) {
      return {
        success: false,
        status: 'not_enrolled',
        message: 'QR code not recognized in system.',
      };
    }

    const student = studentData as unknown as StudentQueryResult;

    if (payload.class_id && student.section_id !== payload.class_id) {
      return {
        success: false,
        status: 'not_enrolled',
        message: `${student.first_name} ${student.last_name} is not enrolled in this section.`,
        student,
      };
    }

    // 3. Check for existing attendance today
    const { data: existingAttendance } = await client
      .from('attendance')
      .select('id, status, recorded_at')
      .eq('attendance_session_id', payload.session_id)
      .eq('student_id', student.id)
      .maybeSingle();

    if (existingAttendance) {
      const existing = existingAttendance as any;
      const timeStr = new Date(existing.recorded_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        success: false,
        status: 'already_recorded',
        message: `${student.first_name} ${student.last_name} was already marked ${existing.status.toUpperCase()} at ${timeStr}.`,
        student,
      };
    }

    // 4. Determine status (e.g. late if past 7:45 AM or explicitly specified)
    const scanTime = new Date();
    const isLate = payload.status === 'late' || (scanTime.getHours() === 7 && scanTime.getMinutes() > 45) || scanTime.getHours() > 7;
    const finalStatus = payload.status || (isLate ? 'late' : 'present');

    // 5. Insert attendance record into Supabase
    const { data: inserted, error: insertError } = await (client.from('attendance') as any)
      .insert({
        student_id: student.id,
        class_id: student.section_id,
        attendance_session_id: payload.session_id,
        attendance_date: payload.attendance_date,
        attendance_type: payload.session_type,
        status: finalStatus,
        recorded_at: scanTime.toISOString(),
        source: 'qr_scan',
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return {
          success: false,
          status: 'already_recorded',
          message: `${student.first_name} ${student.last_name} is already recorded for this session.`,
          student,
        };
      }
      throw new Error(insertError.message);
    }

    // 6. Log audit event
    await (client.from('attendance_events') as any).insert({
      attendance_id: inserted.id,
      event_type: 'scan',
      payload: { source: 'web_qr_scanner' },
    });

    const timeStr = scanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const studentName = `${student.first_name} ${student.last_name}`;

    return {
      success: true,
      status: 'recorded',
      message: `${studentName} marked ${finalStatus.toUpperCase()} (${timeStr})`,
      student: {
        id: student.id,
        lrn: student.lrn,
        first_name: student.first_name,
        last_name: student.last_name,
        middle_name: student.middle_name,
        suffix: student.suffix,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: err?.message || 'Failed to record attendance scan.',
    };
  }
}
