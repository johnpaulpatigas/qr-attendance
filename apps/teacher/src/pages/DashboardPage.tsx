import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  ArrowRight,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  LoadingState,
} from '@qr-attendance/ui';
import { getSupabaseClient, AppStorage } from '@qr-attendance/supabase';
import { getUtc8DateString, formatGradeSection } from '@qr-attendance/validation';
import { useAuth } from '../features/auth';
import {
  fetchClassSections,
  getCachedSectionsSync,
} from '../features/attendance/attendanceSessionService';
import { getQueuedScans } from '../features/attendance/offlineQueueService';

interface DashboardClass {
  id: string;
  grade_level: number;
  section_name: string;
  room_number: string | null;
  student_count: number;
}

interface RecentScan {
  id: string;
  student_name: string;
  lrn: string;
  status: string;
  recorded_at: string;
}

export const DashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const initialSections = getCachedSectionsSync();
  const initialMappedClasses: DashboardClass[] = initialSections.map((s) => ({
    id: s.id,
    grade_level: s.grade_level,
    section_name: s.section_name,
    room_number: s.room_number || null,
    student_count: s.student_count || 0,
  }));
  const cachedMetrics = AppStorage.getJSON('teacher_cached_dashboard_metrics', {
    totalEnrolled: initialMappedClasses.reduce((sum, c) => sum + c.student_count, 0),
    present: 0,
    late: 0,
    absent: 0,
    unrecorded: initialMappedClasses.reduce((sum, c) => sum + c.student_count, 0),
    attendanceRate: 0,
  });
  const cachedScans = AppStorage.getJSON<RecentScan[]>('teacher_cached_recent_scans', []);

  const [classes, setClasses] = useState<DashboardClass[]>(initialMappedClasses);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [loading, setLoading] = useState(initialMappedClasses.length === 0);

  const [metrics, setMetrics] = useState(cachedMetrics);
  const [recentScans, setRecentScans] = useState<RecentScan[]>(cachedScans);

  useEffect(() => {
    if (!user) return;
    const client = getSupabaseClient();

    const loadDashboardData = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        // 1. Fetch Teacher's Assigned Class Sections (Strict Teacher Isolation)
        const mySections = await fetchClassSections();

        const mappedClasses: DashboardClass[] = mySections.map((s) => ({
          id: s.id,
          grade_level: s.grade_level,
          section_name: s.section_name,
          room_number: s.room_number || null,
          student_count: s.student_count || 0,
        }));

        setClasses(mappedClasses);

        interface DashboardAttRow {
          id: string;
          student_id: string;
          status: 'present' | 'late' | 'absent' | 'excused';
          recorded_at: string;
          class_id: string;
          subject_name?: string | null;
          students?: {
            first_name: string;
            last_name: string;
            lrn: string;
          } | null;
        }

        const mySectionIds = mappedClasses.map((c) => c.id);
        let totalEnrolled = 0;
        let typedAttRecords: DashboardAttRow[] = [];

        if (mySectionIds.length > 0) {
          if (selectedClassId !== 'all') {
            totalEnrolled =
              mappedClasses.find((c) => c.id === selectedClassId)?.student_count || 0;
          } else {
            totalEnrolled = mappedClasses.reduce((sum, c) => sum + c.student_count, 0);
          }

          const todayStr = getUtc8DateString();
          let attendanceQuery = client
            .from('attendance')
            .select(
              `
              id,
              student_id,
              status,
              recorded_at,
              class_id,
              subject_name,
              students (
                first_name,
                last_name,
                lrn
              )
            `
            )
            .eq('attendance_date', todayStr)
            .order('recorded_at', { ascending: false });

          if (selectedClassId !== 'all') {
            attendanceQuery = attendanceQuery.eq('class_id', selectedClassId);
          } else {
            attendanceQuery = attendanceQuery.in('class_id', mySectionIds);
          }

          const { data: attRecords } = await attendanceQuery;
          typedAttRecords = (attRecords as unknown as DashboardAttRow[]) || [];
        }

        let present = 0;
        let late = 0;
        let absent = 0;

        typedAttRecords.forEach((r) => {
          if (r.status === 'present') present++;
          else if (r.status === 'late') late++;
          else if (r.status === 'absent') absent++;
        });

        const recordedCount = present + late + absent;
        const unrecorded = Math.max(0, totalEnrolled - recordedCount);
        const rate = totalEnrolled > 0 ? Math.round(((present + late) / totalEnrolled) * 100) : 0;

        const newMetrics = {
          totalEnrolled,
          present,
          late,
          absent,
          unrecorded,
          attendanceRate: rate,
        };
        setMetrics(newMetrics);
        AppStorage.setJSON('teacher_cached_dashboard_metrics', newMetrics);

        if (typedAttRecords.length > 0) {
          const scans: RecentScan[] = typedAttRecords.slice(0, 5).map((r) => ({
            id: r.id,
            student_name: r.students
              ? `${r.students.first_name} ${r.students.last_name}`
              : 'Student',
            lrn: r.students?.lrn || '',
            status: r.status,
            recorded_at: r.recorded_at,
          }));
          setRecentScans(scans);
          AppStorage.setJSON('teacher_cached_recent_scans', scans);
        } else {
          setRecentScans([]);
        }
      } catch (err) {
        console.warn('Operating in offline mode or error loading dashboard data:', err);
        const cachedSections = await fetchClassSections();
        const mappedClasses: DashboardClass[] = cachedSections.map((s) => ({
          id: s.id,
          grade_level: s.grade_level,
          section_name: s.section_name,
          room_number: s.room_number ?? null,
          student_count: s.student_count || 0,
        }));

        setClasses(mappedClasses);

        const queued = getQueuedScans();
        const queuedToday = queued.filter((q) => {
          if (selectedClassId !== 'all' && q.payload.class_id !== selectedClassId) return false;
          return true;
        });

        let totalEnrolled = mappedClasses.reduce((acc, c) => acc + c.student_count, 0);
        if (selectedClassId !== 'all') {
          const matched = mappedClasses.find((c) => c.id === selectedClassId);
          totalEnrolled = matched ? matched.student_count : 0;
        }

        const present = queuedToday.filter((q) => q.payload.status === 'present').length;
        const late = queuedToday.filter((q) => q.payload.status === 'late').length;
        const absent = queuedToday.filter((q) => q.payload.status === 'absent').length;
        const recordedCount = present + late + absent;
        const unrecorded = Math.max(0, totalEnrolled - recordedCount);
        const rate = totalEnrolled > 0 ? Math.round(((present + late) / totalEnrolled) * 100) : 0;

        setMetrics({
          totalEnrolled,
          present,
          late,
          absent,
          unrecorded,
          attendanceRate: rate,
        });

        setRecentScans(
          queuedToday.slice(0, 5).map((q) => ({
            id: q.id,
            student_name: q.student_name || 'Student',
            lrn: q.student_lrn || '',
            status: (q.payload.status as 'present' | 'late' | 'absent' | 'excused') || 'present',
            recorded_at: q.scanned_at,
          }))
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user, selectedClassId]);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading live attendance statistics..." />
      </div>
    );
  }

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold tracking-wider text-blue-200 uppercase">
            Welcome back, {profile?.full_name || 'Teacher'}
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
            Today's Attendance Overview
          </h2>
          <p className="mt-1 text-sm text-blue-100">
            {selectedClass
              ? `${formatGradeSection(selectedClass.grade_level, selectedClass.section_name)} • ${metrics.totalEnrolled} Enrolled`
              : `${classes.length} Class Section${classes.length === 1 ? '' : 's'} • ${metrics.totalEnrolled} Total Enrolled`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {classes.length > 0 && (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-lg border border-blue-500 bg-blue-700/80 px-3 py-2.5 text-xs font-semibold text-white focus:ring-2 focus:ring-white focus:outline-none"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatGradeSection(c.grade_level, c.section_name)}
                </option>
              ))}
            </select>
          )}

          <Link
            to={
              selectedClassId && selectedClassId !== 'all'
                ? `/attendance?section=${selectedClassId}`
                : '/attendance'
            }
          >
            <Button
              size="md"
              className="shrink-0 bg-white font-bold text-blue-700 shadow-md hover:bg-blue-50"
              leftIcon={<QrCode className="h-4 w-4" />}
            >
              Start Scanning
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Total Enrolled
              </span>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{metrics.totalEnrolled}</div>
            <p className="mt-1 text-xs text-slate-500">Enrolled learners</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
                Present
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{metrics.present}</div>
            <p className="mt-1 text-xs text-emerald-600">{metrics.attendanceRate}% attendance</p>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-amber-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-amber-700 uppercase">
                Late
              </span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{metrics.late}</div>
            <p className="mt-1 text-xs text-amber-600">Marked tardy</p>
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-rose-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-rose-700 uppercase">
                Absent
              </span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">{metrics.absent}</div>
            <p className="mt-1 text-xs text-rose-600">Recorded absent</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 border-slate-200 sm:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Unrecorded
              </span>
              <HelpCircle className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">{metrics.unrecorded}</div>
            <p className="mt-1 text-xs text-slate-500">Pending scan</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Assigned Classes</CardTitle>
            <Link to="/classes">
              <Button size="sm" variant="ghost" className="text-xs">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {classes.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-slate-500">
                  No class sections registered in the database yet.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Link to="/classes">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<PlusCircle className="h-4 w-4" />}
                    >
                      Create Class
                    </Button>
                  </Link>
                  <Link to="/students/import-sf1">
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                    >
                      Import SF1
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              classes.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-4 transition-colors hover:bg-slate-50"
                >
                  <div>
                    <Link
                      to={`/students?section=${cls.id}&grade=${cls.grade_level}`}
                      className="font-semibold text-slate-900 transition-colors hover:text-blue-600"
                    >
                      {formatGradeSection(cls.grade_level, cls.section_name)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      <Link
                        to={`/students?section=${cls.id}&grade=${cls.grade_level}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {cls.student_count} Students
                      </Link>{' '}
                      {cls.room_number ? `• Room ${cls.room_number}` : ''}
                    </p>
                  </div>
                  <Link to={`/attendance?section=${cls.id}&grade=${cls.grade_level}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      Take Attendance
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance Scans</CardTitle>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No scans recorded yet today. Open the Attendance page to start scanning student QR
                passes.
              </div>
            ) : (
              <div className="space-y-3">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{scan.student_name}</div>
                      <div className="text-xs text-slate-500">LRN: {scan.lrn}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          scan.status === 'present'
                            ? 'success'
                            : scan.status === 'late'
                              ? 'warning'
                              : 'danger'
                        }
                        size="sm"
                        className="text-[10px] font-bold uppercase"
                      >
                        {scan.status}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {new Date(scan.recorded_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
