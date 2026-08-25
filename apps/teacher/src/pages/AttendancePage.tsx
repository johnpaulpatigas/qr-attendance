import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  Play,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  UserCheck,
  Edit3,
  Wifi,
  WifiOff,
  RefreshCw,
  CloudOff,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  Badge,
} from '@qr-attendance/ui';
import type {
  ClassSectionWithDetails,
  AttendanceSession,
  AttendanceSummary,
  AttendanceRecordWithStudent,
  SessionType,
  StudentWithSection,
} from '@qr-attendance/types';
import { QrScanner } from '../features/attendance/QrScanner';
import {
  fetchClassSections,
  getOrCreateAttendanceSession,
  fetchAttendanceSummary,
  fetchSessionRecords,
} from '../features/attendance/attendanceSessionService';
import { submitAttendanceScan } from '../features/attendance/attendanceRecorderService';
import { syncOfflineQueue, cacheClassRoster } from '../features/attendance/offlineQueueService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useAppBackButton } from '../hooks/useAppBackButton';
import { fetchStudents } from '../features/students/studentService';
import { ManualAttendanceModal } from '../features/attendance/ManualAttendanceModal';
import { useAuth } from '../features/auth/AuthContext';
import { getUtc8DateString } from '@qr-attendance/validation';

// Synthesize pleasant success / warning audio chime via Web Audio API
function playScanTone(type: 'success' | 'duplicate' | 'error') {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'duplicate') {
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch {
    // Ignore audio context autoplay limitations
  }
}

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const { isOnline, queuedCount } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [sections, setSections] = useState<ClassSectionWithDetails[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('morning');
  const [attendanceDate, setAttendanceDate] = useState(getUtc8DateString());

  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary>({
    total_students: 0,
    present_count: 0,
    late_count: 0,
    absent_count: 0,
    unrecorded_count: 0,
  });

  const [recentRecords, setRecentRecords] = useState<AttendanceRecordWithStudent[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [studentsInClass, setStudentsInClass] = useState<StudentWithSection[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Android back button: stop camera scanner or close modal first
  useAppBackButton({
    onCustomBack: () => {
      if (isScanning) {
        setIsScanning(false);
        return true;
      }
      if (isManualModalOpen) {
        setIsManualModalOpen(false);
        return true;
      }
      return false;
    },
  });

  // Scan feedback state
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'duplicate' | 'error' | 'offline';
    title: string;
    message: string;
    studentName?: string;
  } | null>(null);

  // Load class sections
  useEffect(() => {
    fetchClassSections().then((secs) => {
      setSections(secs);
      if (secs.length > 0 && !selectedClassId) {
        setSelectedClassId(secs[0].id);
      }
    });
  }, []);

  // Initialize active session and load students when section/date/sessionType changes
  const initSession = useCallback(async () => {
    if (!selectedClassId) return;

    const teacherId = user?.id || '';
    const sess = await getOrCreateAttendanceSession(
      selectedClassId,
      attendanceDate,
      sessionType,
      teacherId
    );
    setActiveSession(sess);

    const [summ, recs, stds] = await Promise.all([
      fetchAttendanceSummary(sess.id, selectedClassId),
      fetchSessionRecords(sess.id),
      fetchStudents({ sectionId: selectedClassId }),
    ]);

    setSummary(summ);
    setRecentRecords(recs);
    setStudentsInClass(stds);

    // Cache students roster locally for offline recognition
    if (stds && stds.length > 0) {
      cacheClassRoster(
        selectedClassId,
        stds.map((s) => ({
          id: s.id,
          lrn: s.lrn,
          first_name: s.first_name,
          last_name: s.last_name,
          middle_name: s.middle_name,
          suffix: s.suffix,
          qr_identifier: s.qr_identifier,
          section_id: s.section_id,
        }))
      );
    }
  }, [selectedClassId, attendanceDate, sessionType, user?.id]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const handleManualSync = async () => {
    if (isSyncing || queuedCount === 0) return;
    setIsSyncing(true);
    try {
      const syncResult = await syncOfflineQueue();
      if (syncResult.synced > 0 || syncResult.duplicates > 0) {
        await initSession();
        setFeedback({
          type: 'success',
          title: '✓ Offline Scans Synchronized',
          message: `Synced ${syncResult.synced} scan(s) successfully (${syncResult.duplicates} already up to date).`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Sync Incomplete',
        message: err?.message || 'Failed to sync all queued scans. Will retry automatically.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Automatically flush offline queue when device reconnects
  useEffect(() => {
    if (isOnline && queuedCount > 0 && !isSyncing) {
      handleManualSync();
    }
  }, [isOnline, queuedCount]);

  // Handle incoming QR scan
  const handleScan = async (decodedPayload: string) => {
    if (!activeSession || !selectedClassId) return;

    const response = await submitAttendanceScan({
      qr_payload: decodedPayload,
      class_id: selectedClassId,
      session_id: activeSession.id,
      attendance_date: attendanceDate,
      session_type: sessionType,
      recorded_by: user?.id,
    });

    const studentFullName = response.student
      ? `${response.student.first_name} ${response.student.last_name}`
      : 'Student';

    if (response.status === 'recorded' || response.status === 'queued_offline') {
      const isOfflineQueued = response.status === 'queued_offline';
      const recordedStatus = response.attendance?.status || 'present';
      playScanTone('success');
      setFeedback({
        type: isOfflineQueued ? 'offline' : 'success',
        title: isOfflineQueued
          ? '✓ Saved Offline'
          : recordedStatus === 'late'
          ? '✓ Marked Late'
          : '✓ Attendance Recorded',
        message: response.message,
        studentName: studentFullName,
      });

      // Update counters and recent list accurately
      setSummary((prev) => ({
        ...prev,
        present_count: recordedStatus === 'present' ? prev.present_count + 1 : prev.present_count,
        late_count: recordedStatus === 'late' ? prev.late_count + 1 : prev.late_count,
        unrecorded_count: Math.max(0, prev.unrecorded_count - 1),
      }));

      if (response.student) {
        const newRecord: AttendanceRecordWithStudent = {
          id: response.attendance?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `offline_${Date.now()}`),
          student_id: response.student.id,
          class_id: selectedClassId,
          attendance_session_id: activeSession.id,
          attendance_date: attendanceDate,
          attendance_type: sessionType,
          status: recordedStatus,
          recorded_at: response.attendance?.recorded_at || new Date().toISOString(),
          recorded_by: user?.id || '',
          source: 'qr_scan',
          notes: isOfflineQueued ? 'Recorded offline (queued for sync)' : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          student: response.student,
        };
        setRecentRecords((prev) => [newRecord, ...prev.filter(r => r.student_id !== response.student?.id).slice(0, 9)]);
      }
    } else if (response.status === 'already_recorded') {
      playScanTone('duplicate');
      setFeedback({
        type: 'duplicate',
        title: 'Already Recorded',
        message: response.message,
        studentName: studentFullName,
      });
    } else {
      playScanTone('error');
      setFeedback({
        type: 'error',
        title: 'Scan Error',
        message: response.message,
        studentName: studentFullName,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Attendance Scanner</h2>
            {isOnline ? (
              <Badge variant="success" size="sm" className="flex items-center gap-1 font-semibold">
                <Wifi className="h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="danger" size="sm" className="flex items-center gap-1 font-semibold animate-pulse">
                <WifiOff className="h-3 w-3" /> Offline Mode
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Real-time QR barcode scanner for teacher-led classroom attendance with offline tolerance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {queuedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              isLoading={isSyncing}
              leftIcon={<RefreshCw className="h-4 w-4 text-blue-600" />}
              className="border-blue-300 bg-blue-50/50 text-blue-800 hover:bg-blue-100"
            >
              Sync Queue ({queuedCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsManualModalOpen(true)}
            leftIcon={<Edit3 className="h-4 w-4" />}
            disabled={studentsInClass.length === 0}
          >
            Manual Mark / Correction
          </Button>
          <Badge variant={activeSession ? 'info' : 'outline'} size="md">
            Session: {activeSession ? 'Active' : 'Initializing...'}
          </Badge>
        </div>
      </div>

      {/* Class & Session Controls Bar */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Select
              label="Select Class / Section"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              options={
                sections.length > 0
                  ? sections.map((s) => ({
                      value: s.id,
                      label: `Grade ${s.grade_level} — ${s.section_name}`,
                    }))
                  : [{ value: '', label: 'No sections registered yet' }]
              }
            />

            <Select
              label="Session Type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              options={[
                { value: 'morning', label: 'Morning Session' },
                { value: 'afternoon', label: 'Afternoon Session' },
              ]}
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Attendance Date
              </label>
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-end">
              <Button
                className="w-full"
                size="md"
                variant={isScanning ? 'danger' : 'primary'}
                leftIcon={isScanning ? <QrCode className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                onClick={() => setIsScanning(!isScanning)}
                disabled={!selectedClassId}
              >
                {isScanning ? 'Stop Camera' : 'Start Camera Scanner'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Feedback Alert Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-2xl p-5 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-600 text-white'
              : feedback.type === 'offline'
              ? 'bg-blue-600 text-white'
              : feedback.type === 'duplicate'
              ? 'bg-amber-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-7 w-7 text-white" />
              ) : feedback.type === 'offline' ? (
                <CloudOff className="h-7 w-7 text-white" />
              ) : feedback.type === 'duplicate' ? (
                <Clock className="h-7 w-7 text-white" />
              ) : (
                <XCircle className="h-7 w-7 text-white" />
              )}
            </div>
            <div>
              <h4 className="text-lg font-bold">{feedback.title}</h4>
              <p className="text-sm text-white/90">{feedback.message}</p>
            </div>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs uppercase font-bold tracking-wider text-white/80 hover:text-white px-3 py-1 bg-white/10 rounded-lg"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Camera Scanner & Metrics Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Camera Scanner Viewport */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="h-5 w-5 text-blue-600" />
                Live Camera Scanner
              </CardTitle>
              <span className="text-xs font-normal text-slate-500">
                Auto-resumes after each student
              </span>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <QrScanner isActive={isScanning} onScan={handleScan} />
            </CardContent>
          </Card>
        </div>

        {/* Live Counters & Recent Activity */}
        <div className="space-y-6">
          {/* Real-time Session Counters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Session Counters</span>
                <span className="text-xs font-normal text-slate-400">Live</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4 text-slate-400" /> Total Students
                </span>
                <span className="font-bold text-slate-900">{summary.total_students}</span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Present
                </span>
                <span className="font-bold text-emerald-700">{summary.present_count}</span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                  <Clock className="h-4 w-4" /> Late
                </span>
                <span className="font-bold text-amber-700">{summary.late_count}</span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-rose-600 font-medium">
                  <XCircle className="h-4 w-4" /> Absent
                </span>
                <span className="font-bold text-rose-700">{summary.absent_count}</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <HelpCircle className="h-4 w-4 text-slate-400" /> Unrecorded
                </span>
                <span className="font-bold text-slate-600">{summary.unrecorded_count}</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Scans Log */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Recent Scans</span>
                <Badge variant="outline" size="sm">
                  {recentRecords.length} recorded
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentRecords.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No scans recorded yet in this session.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {recentRecords.slice(0, 6).map((rec) => (
                    <div key={rec.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">
                          <UserCheck className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {rec.student
                              ? `${rec.student.first_name} ${rec.student.last_name}`
                              : 'Student'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {rec.student?.lrn}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={rec.status === 'present' ? 'success' : 'warning'}
                          size="sm"
                        >
                          {rec.status}
                        </Badge>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(rec.recorded_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Manual Attendance & Correction Modal */}
      {activeSession && (
        <ManualAttendanceModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          students={studentsInClass}
          sessionId={activeSession.id}
          classId={selectedClassId}
          attendanceDate={attendanceDate}
          sessionType={sessionType}
          onRecordUpdated={initSession}
        />
      )}
    </div>
  );
};
