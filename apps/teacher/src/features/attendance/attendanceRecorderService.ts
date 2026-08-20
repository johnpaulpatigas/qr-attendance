import { getSupabaseClient } from '@qr-attendance/supabase';
import type { RecordAttendancePayload, RecordAttendanceResponse, SessionType, AttendanceStatus } from '@qr-attendance/types';
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

/**
 * Calculates standard attendance status based on school session schedule
 */
export function calculateAttendanceStatus(
  sessionType: SessionType,
  scanTime: Date = new Date()
): AttendanceStatus {
  const hours = scanTime.getHours();
  const minutes = scanTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Morning Session: Cutoff is 7:45 AM (465 minutes)
  if (sessionType === 'morning') {
    // If scanned between 7:46 AM and 12:00 PM -> late
    if (timeInMinutes > 465 && timeInMinutes < 720) {
      return 'late';
    }
    return 'present';
  }

  // Afternoon Session: Cutoff is 1:15 PM (795 minutes)
  if (sessionType === 'afternoon') {
    // If scanned between 1:16 PM and 5:00 PM -> late
    if (timeInMinutes > 795 && timeInMinutes < 1020) {
      return 'late';
    }
    return 'present';
  }

  return 'present';
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

    // 3. Check for existing attendance in this session or on this date/type
    const { data: existingAttendance } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', student.id)
      .eq('attendance_session_id', payload.session_id)
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
        attendance: existing,
      };
    }

    // 4. Resolve authenticated teacher ID for recorded_by
    let teacherId = payload.recorded_by;
    if (!teacherId) {
      const { data: { user } } = await client.auth.getUser();
      teacherId = user?.id;
    }

    // If teacherId is still not found, query session owner
    if (!teacherId) {
      const { data: sessionData } = await client
        .from('attendance_sessions')
        .select('teacher_id')
        .eq('id', payload.session_id)
        .maybeSingle();
      teacherId = (sessionData as any)?.teacher_id;
    }

    if (!teacherId) {
      return {
        success: false,
        status: 'unauthorized',
        message: 'Unable to verify teacher credentials for recording attendance.',
      };
    }

    // 5. Determine status based on explicit payload or session time schedule
    const scanTime = new Date();
    const finalStatus: AttendanceStatus = payload.status || calculateAttendanceStatus(payload.session_type, scanTime);

    // 6. Insert attendance record into Supabase with valid recorded_by
    const { data: inserted, error: insertError } = await (client.from('attendance') as any)
      .insert({
        student_id: student.id,
        class_id: student.section_id,
        attendance_session_id: payload.session_id,
        attendance_date: payload.attendance_date,
        attendance_type: payload.session_type,
        status: finalStatus,
        recorded_by: teacherId,
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

    // 7. Log audit event
    if (inserted?.id) {
      await (client.from('attendance_events') as any).insert({
        attendance_id: inserted.id,
        student_id: student.id,
        teacher_id: teacherId,
        event_type: 'scanned',
        timestamp: scanTime.toISOString(),
        metadata: { source: 'web_qr_scanner', session_type: payload.session_type },
      });
    }

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
      attendance: inserted,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: err?.message || 'Failed to record attendance scan.',
    };
  }
}
