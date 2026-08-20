import React, { useState } from 'react';
import { Modal, Button, Select, Input } from '@qr-attendance/ui';
import type { AttendanceStatus, StudentWithSection } from '@qr-attendance/types';
import { getSupabaseClient } from '@qr-attendance/supabase';
import { useAuth } from '../auth/AuthContext';

export interface ManualAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentWithSection[];
  sessionId: string;
  classId: string;
  attendanceDate: string;
  onRecordUpdated: () => void;
}

export const ManualAttendanceModal: React.FC<ManualAttendanceModalProps> = ({
  isOpen,
  onClose,
  students,
  sessionId,
  classId,
  attendanceDate,
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
      setError('A valid reason (at least 3 characters) is required for manual attendance records and corrections.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getSupabaseClient();
      const studentId = selectedStudentId || students[0]?.id;

      // Upsert attendance record
      const attendanceData = {
        student_id: studentId,
        class_id: classId,
        attendance_session_id: sessionId,
        attendance_date: attendanceDate,
        attendance_type: 'morning',
        status: status,
        recorded_by: user?.id || null,
        source: 'manual',
        notes: reason.trim(),
        recorded_at: new Date().toISOString(),
      };

      const { data: record, error: attError } = await (client.from('attendance') as any)
        .upsert(attendanceData, { onConflict: 'student_id,attendance_session_id' })
        .select()
        .single();

      if (attError) {
        throw new Error(attError.message);
      }

      // Record Audit Event
      if (record?.id) {
        await (client.from('attendance_events') as any).insert({
          attendance_id: record.id,
          student_id: studentId,
          teacher_id: user?.id || null,
          event_type: 'corrected',
          timestamp: new Date().toISOString(),
          metadata: {
            reason: reason.trim(),
            changed_to: status,
            teacher_name: profile?.full_name || 'Teacher',
          },
        });
      }

      onRecordUpdated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update attendance record');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Attendance / Correction"
      description="Manually record or correct a student's status with an audit explanation"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <Select
          label="Select Student"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          options={
            students.length > 0
              ? students.map((s) => ({
                  value: s.id,
                  label: `${s.last_name}, ${s.first_name} (LRN: ${s.lrn})`,
                }))
              : [{ value: '', label: 'No students enrolled in this section' }]
          }
        />

        <Select
          label="Attendance Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
          options={[
            { value: 'present', label: 'Present' },
            { value: 'late', label: 'Late' },
            { value: 'absent', label: 'Absent' },
            { value: 'excused', label: 'Excused' },
          ]}
        />

        <Input
          label="Reason for Manual Entry / Correction"
          placeholder="e.g. Arrived with clinic slip, forgot ID card, etc."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Required for audit logging and historical transparency"
          required
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={students.length === 0}>
            Save Record & Log Audit
          </Button>
        </div>
      </form>
    </Modal>
  );
};
