import { getSupabaseClient, withNetworkTimeout } from '@qr-attendance/supabase';
import type {
  RecordAttendancePayload,
  RecordAttendanceResponse,
  SessionType,
  AttendanceStatus,
} from '@qr-attendance/types';
import { parseQrPayload } from '@qr-attendance/validation';
import { enqueueScan, findCachedStudent } from './offlineQueueService';
import { isNetworkOnline } from './networkManager';

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
 * Calculates standard attendance status based on session type, date, and scan time.
 * - Morning session cutoff: 7:45 AM of the attendance date.
 * - Afternoon session cutoff: 1:15 PM of the attendance date.
 * Scans occurring after the session cutoff are marked 'late'.
 */
export function calculateAttendanceStatus(
  sessionType: SessionType,
  attendanceDateStr: string,
  scanTime: Date = new Date()
): AttendanceStatus {
  if (!attendanceDateStr) {
    return 'present';
  }

  const [year, month, day] = attendanceDateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return 'present';
  }

  if (sessionType === 'morning') {
    const cutoff = new Date(year, month - 1, day, 7, 45, 59, 999);
    return scanTime.getTime() > cutoff.getTime() ? 'late' : 'present';
  }

  if (sessionType === 'afternoon') {
    const cutoff = new Date(year, month - 1, day, 13, 15, 59, 999);
    return scanTime.getTime() > cutoff.getTime() ? 'late' : 'present';
  }

  return 'present';
}

function handleOfflineQueueing(
  payload: RecordAttendancePayload,
  reason: string = 'Saved Offline'
): RecordAttendanceResponse {
  const cachedStudent = findCachedStudent(payload.class_id, payload.qr_payload);
  const studentName = cachedStudent
    ? `${cachedStudent.first_name} ${cachedStudent.last_name}`
    : 'Student';
  const scanTime = new Date();
  const finalStatus =
    payload.status ||
    calculateAttendanceStatus(payload.session_type, payload.attendance_date, scanTime);
  const timeStr = scanTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const updatedPayload: RecordAttendancePayload = {
    ...payload,
    status: finalStatus,
  };

  enqueueScan(updatedPayload, {
    name: studentName,
    lrn: cachedStudent?.lrn,
  });

  return {
    success: true,
    status: 'queued_offline',
    message: `${studentName} marked ${finalStatus.toUpperCase()} (${timeStr}) [${reason}]`,
    student: cachedStudent
      ? {
          id: cachedStudent.id,
          lrn: cachedStudent.lrn,
          first_name: cachedStudent.first_name,
          last_name: cachedStudent.last_name,
          middle_name: cachedStudent.middle_name,
          suffix: cachedStudent.suffix,
        }
      : undefined,
    attendance: {
      id: `offline_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      student_id: cachedStudent?.id || '',
      class_id: payload.class_id,
      attendance_session_id: payload.session_id,
      attendance_date: payload.attendance_date,
      attendance_type: payload.session_type,
      subject_name: payload.subject_name || null,
      status: finalStatus,
      recorded_by: payload.recorded_by || '',
      recorded_at: scanTime.toISOString(),
      source: 'qr_scan',
      notes: 'Recorded offline',
      created_at: scanTime.toISOString(),
      updated_at: scanTime.toISOString(),
    },
  };
}

export async function submitAttendanceScan(
  payload: RecordAttendancePayload
): Promise<RecordAttendanceResponse> {
  // Validate format before dispatching
  const parsedQr = parseQrPayload(payload.qr_payload);
  const identifier = parsedQr.success && parsedQr.identifier
    ? parsedQr.identifier
    : payload.qr_payload.replace(/^ATTENDANCE:/i, '').trim();

  if (!identifier) {
    return {
      success: false,
      status: 'invalid_qr',
      message: 'Invalid student QR code format.',
    };
  }

  // 0. If device is currently offline, queue locally and return immediate confirmation
  if (!isNetworkOnline()) {
    return handleOfflineQueueing(payload, 'Saved Offline');
  }

  const client = getSupabaseClient();

  try {
    const { data, error } = await withNetworkTimeout(
      client.functions.invoke<RecordAttendanceResponse>('record-attendance', {
        body: payload,
      }),
      3500
    );

    if (!error && data) {
      return data;
    }
  } catch {
    // Fall back to direct database execution or offline queue if edge function is unavailable/timed out
  }

  try {
    const { data: studentData, error: studentError } = await withNetworkTimeout(
      client
        .from('students')
        .select('id, lrn, first_name, last_name, middle_name, suffix, section_id')
        .or(`qr_identifier.eq.${identifier},id.eq.${identifier}`)
        .maybeSingle(),
      3000
    );

    if (studentError || !studentData) {
      // Check offline cache in case the student exists in local cache
      const cached = findCachedStudent(payload.class_id, payload.qr_payload);
      if (cached) {
        return handleOfflineQueueing(payload, 'Saved Offline');
      }

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

    const { data: existingAttendance } = await withNetworkTimeout(
      client
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .eq('attendance_session_id', payload.session_id)
        .maybeSingle(),
      3000
    );

    if (existingAttendance) {
      const timeStr = new Date(existingAttendance.recorded_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        success: false,
        status: 'already_recorded',
        message: `${student.first_name} ${student.last_name} was already marked ${existingAttendance.status.toUpperCase()} at ${timeStr}.`,
        student,
        attendance: existingAttendance,
      };
    }

    let teacherId = payload.recorded_by;
    if (!teacherId) {
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        teacherId = user?.id;
      } catch {
        // Ignore
      }
    }

    if (!teacherId) {
      teacherId = 'teacher';
    }

    const scanTime = new Date();
    const finalStatus: AttendanceStatus =
      payload.status ||
      calculateAttendanceStatus(payload.session_type, payload.attendance_date, scanTime);

    const { data: inserted, error: insertError } = await withNetworkTimeout(
      client
        .from('attendance')
        .insert({
          student_id: student.id,
          class_id: student.section_id,
          attendance_session_id: payload.session_id,
          attendance_date: payload.attendance_date,
          attendance_type: payload.session_type,
          subject_name: payload.subject_name || null,
          status: finalStatus,
          recorded_by: teacherId,
          recorded_at: scanTime.toISOString(),
          source: 'qr_scan',
        })
        .select()
        .single(),
      3000
    );

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

    if (inserted?.id) {
      Promise.resolve(
        client.from('attendance_events').insert({
          attendance_id: inserted.id,
          student_id: student.id,
          teacher_id: teacherId,
          event_type: 'scanned',
          timestamp: scanTime.toISOString(),
          metadata: {
            source: 'capacitor_qr_scanner',
            session_type: payload.session_type,
          },
        })
      ).catch(() => {});
    }

    const timeStr = scanTime.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
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
  } catch (err: unknown) {
    const errorObj = err as { message?: string; name?: string };
    const isNetworkErr =
      !isNetworkOnline() ||
      errorObj?.message?.includes('Failed to fetch') ||
      errorObj?.message?.includes('NetworkError') ||
      errorObj?.message?.includes('timed out') ||
      errorObj?.name === 'TypeError';

    if (isNetworkErr) {
      return handleOfflineQueueing(payload, 'Saved Offline - Network Disconnected');
    }

    return {
      success: false,
      status: 'error',
      message: errorObj?.message || 'Failed to record attendance scan.',
    };
  }
}
