import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  User,
  AlertCircle,
  QrCode,
  WifiOff,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  LoadingState,
  EmptyState,
} from '@qr-attendance/ui';
import { formatGradeSection } from '@qr-attendance/validation';
import { useAuth } from '../features/auth';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  fetchTodayAttendance,
  type TodayStudentStatus,
  type AttendanceRecordWithTeacher,
} from '../features/attendance/parentAttendanceService';
import { LinkStudentModal } from '../components/layout/LinkStudentModal';

interface SessionCardProps {
  sessionTitle: string;
  record: AttendanceRecordWithTeacher | null;
  gradeLevel: number;
  sectionName: string;
  defaultAdviser?: string | null;
}

const SessionCard: React.FC<SessionCardProps> = ({
  sessionTitle,
  record,
  gradeLevel,
  sectionName,
  defaultAdviser,
}) => {
  const isRecorded = !!record;
  const status = record?.status;

  const badgeVariant = !isRecorded
    ? 'outline'
    : status === 'present'
      ? 'success'
      : status === 'late'
        ? 'warning'
        : status === 'absent'
          ? 'danger'
          : 'info';

  const timeFormatted = isRecorded
    ? new Date(record.recorded_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <Card className="flex h-full flex-col justify-between border shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
        <CardTitle className="text-base font-semibold text-slate-800">{sessionTitle}</CardTitle>
        <Badge variant={badgeVariant} size="sm" className="font-semibold capitalize">
          {isRecorded ? `${status}` : 'Pending Scan'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3.5 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-500">
            <Clock className="h-4 w-4 text-slate-400" /> Time In / Recorded
          </span>
          <span
            className={`font-semibold ${isRecorded ? 'text-slate-900' : 'font-mono text-slate-400'}`}
          >
            {timeFormatted}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-500">
            <User className="h-4 w-4 text-slate-400" /> Recorded By
          </span>
          <span className={`font-medium ${isRecorded ? 'text-slate-900' : 'text-slate-400'}`}>
            {record?.teacher_name || (isRecorded ? defaultAdviser || 'Class Adviser' : '—')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-500">
            <MapPin className="h-4 w-4 text-slate-400" /> Section
          </span>
          <span className="font-medium text-slate-900">
            {formatGradeSection(gradeLevel, sectionName)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-500">
            <QrCode className="h-4 w-4 text-slate-400" /> Method
          </span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {isRecorded ? (record.source === 'qr_scan' ? 'QR Code Scan' : 'Manual Entry') : '—'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export const TodayAttendancePage: React.FC = () => {
  const { activeChild } = useAuth();
  const isOnline = useNetworkStatus();
  const [status, setStatus] = useState<TodayStudentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  useEffect(() => {
    if (!activeChild) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchTodayAttendance(activeChild.student_id).then((res) => {
      setStatus(res);
      setLoading(false);
    });
  }, [activeChild]);

  if (!activeChild) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <EmptyState
          title="No Student Linked to Account"
          description="Your parent account is ready! Enter your student's 12-digit Learner Reference Number (LRN) to start receiving real-time attendance updates."
          action={{
            label: 'Link Student by LRN',
            onClick: () => setIsLinkModalOpen(true),
          }}
        />
        <LinkStudentModal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} />
      </div>
    );
  }

  const childName = `${activeChild.first_name} ${activeChild.last_name}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            You are currently offline. Showing last cached attendance records for your child.
          </span>
        </div>
      )}

      {/* Active Child Summary Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Today's Attendance</h2>
          <p className="text-sm text-slate-500">
            Real-time status for <strong className="text-slate-800">{childName}</strong> (LRN:{' '}
            {activeChild.lrn})
          </p>
        </div>
        {status && (
          <Badge
            variant={
              status.overallStatus === 'present'
                ? 'success'
                : status.overallStatus === 'late'
                  ? 'warning'
                  : status.overallStatus === 'absent'
                    ? 'danger'
                    : 'outline'
            }
            size="md"
            className="self-start font-bold capitalize sm:self-auto"
          >
            {status.overallStatus === 'unrecorded'
              ? 'Pending Scan'
              : `${status.overallStatus} Today`}
          </Badge>
        )}
      </div>

      {loading ? (
        <LoadingState message="Fetching today's attendance record..." />
      ) : status && status.hasScannedToday ? (
        <div className="space-y-6">
          {/* Main Status Hero Card */}
          <Card
            className={`border shadow-sm ${
              status.overallStatus === 'present'
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-500/10 to-teal-500/5'
                : status.overallStatus === 'late'
                  ? 'border-amber-200 bg-gradient-to-br from-amber-500/10 to-orange-500/5'
                  : 'border-rose-200 bg-gradient-to-br from-rose-500/10 to-red-500/5'
            }`}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
                    status.overallStatus === 'present'
                      ? 'bg-emerald-600'
                      : status.overallStatus === 'late'
                        ? 'bg-amber-600'
                        : 'bg-rose-600'
                  }`}
                >
                  {status.overallStatus === 'present' ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : status.overallStatus === 'late' ? (
                    <Clock className="h-7 w-7" />
                  ) : (
                    <XCircle className="h-7 w-7" />
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                    Recorded via QR Scan
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">
                    Marked {status.overallStatus.toUpperCase()} at{' '}
                    {status.lastRecordedAt
                      ? new Date(status.lastRecordedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Recorded by{' '}
                    <span className="font-semibold text-slate-900">
                      {status.recordedByTeacherName || 'Class Adviser'}
                    </span>{' '}
                    at {formatGradeSection(activeChild.grade_level, activeChild.section_name)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Symmetrical Session Cards (Morning & Afternoon) */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SessionCard
              sessionTitle="Morning Session"
              record={status.morningRecord}
              gradeLevel={activeChild.grade_level}
              sectionName={activeChild.section_name}
              defaultAdviser={status.recordedByTeacherName}
            />
            <SessionCard
              sessionTitle="Afternoon Session"
              record={status.afternoonRecord}
              gradeLevel={activeChild.grade_level}
              sectionName={activeChild.section_name}
              defaultAdviser={status.recordedByTeacherName}
            />
          </div>
        </div>
      ) : (
        <Card className="border-dashed border-slate-300">
          <CardContent className="space-y-3 py-12 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-slate-400" />
            <h4 className="text-base font-semibold text-slate-800">
              No Attendance Scanned Yet Today
            </h4>
            <p className="mx-auto max-w-sm text-xs text-slate-500">
              Attendance has not yet been taken for {childName} in{' '}
              {formatGradeSection(activeChild.grade_level, activeChild.section_name)}. You will
              receive a notification as soon as the student is scanned.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
