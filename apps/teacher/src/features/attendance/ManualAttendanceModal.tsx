import React, { useState } from 'react';
import { Modal, Button, Select, Input } from '@qr-attendance/ui';
import type { AttendanceStatus, SessionType, StudentWithSection } from '@qr-attendance/types';
import { getSupabaseClient } from '@qr-attendance/supabase';
import { useAuth } from '../auth/AuthContext';
import { enqueueScan } from './offlineQueueService';

export interface ManualAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentWithSection[];
  sessionId: string;
  classId: string;
  attendanceDate: string;
  sessionType?: SessionType;
  onRecordUpdated: () => void;
}

export const ManualAttendanceModal: React.FC<ManualAttendanceModalProps> = ({
  isOpen,
  onClose,
  students,
  sessionId,
  classId,
  attendanceDate,
  sessionType = 'morning',
  onRecordUpdated,
}) => {
  const { user, profile } = useAuth();
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError(
        'A valid reason (at least 3 characters) is required for manual attendance records and corrections.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getSupabaseClient();
      const studentId = selectedStudentId || students[0]?.id;

      const attendanceData = {
        student_id: studentId,
        class_id: classId,
        attendance_session_id: sessionId,
        attendance_date: attendanceDate,
        attendance_type: sessionType,
        status: status,
        recorded_by: user?.id || '',
        source: 'manual' as const,
        notes: reason.trim(),
        recorded_at: new Date().toISOString(),
      };

      const { data: record, error: attError } = await client
        .from('attendance')
        .upsert(attendanceData, {
          onConflict: 'student_id,attendance_session_id',
        })
        .select()
        .single();

      if (attError) {
        throw new Error(attError.message);
      }

      if (record?.id) {
        await client.from('attendance_events').insert({
          attendance_id: record.id,
          student_id: studentId,
          teacher_id: user?.id || null,
          event_type: 'corrected',
          timestamp: new Date().toISOString(),
          metadata: {
            reason: reason.trim(),
            changed_to: status,
            session_type: sessionType,
            teacher_name: profile?.full_name || 'Teacher',
          },
        });
      }

      onRecordUpdated();
      onClose();
    } catch {
      // Offline fallback: Queue manual attendance update locally
      try {
        const studentId = selectedStudentId || students[0]?.id;
        const targetStudent = students.find((s) => s.id === studentId);
        enqueueScan(
          {
            qr_payload: targetStudent?.qr_identifier || `ATTENDANCE:${studentId}`,
            class_id: classId,
            session_id: sessionId,
            attendance_date: attendanceDate,
            session_type: sessionType,
            status: status,
            source: 'manual',
            notes: reason.trim(),
            client_event_id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `manual_${Date.now()}`,
          },
          {
            name: targetStudent
              ? `${targetStudent.first_name} ${targetStudent.last_name}`
              : undefined,
            lrn: targetStudent?.lrn,
          }
        );

        onRecordUpdated();
        onClose();
      } catch (innerErr: unknown) {
        setError(
          innerErr instanceof Error ? innerErr.message : 'Failed to update attendance record.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manual Attendance Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Select Student</label>
          <Select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            disabled={isLoading}
          >
            {students.map((st) => (
              <option key={st.id} value={st.id}>
                {st.last_name}, {st.first_name} ({st.lrn})
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Attendance Status
          </label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
            disabled={isLoading}
          >
            <option value="present">Present</option>
            <option value="late">Late (Tardy)</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Reason for Manual Entry / Correction
          </label>
          <Input
            placeholder="e.g. Student forgot ID badge / Parent excused clinic visit"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Save Record
          </Button>
        </div>
      </form>
    </Modal>
  );
};
