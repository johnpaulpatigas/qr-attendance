import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, LoadingState, Badge } from '@qr-attendance/ui';
import { formatGradeSection } from '@qr-attendance/validation';
import { useAuth } from '../features/auth/AuthContext';
import { fetchStudentStatistics, type StudentAttendanceMetrics } from '../features/attendance/parentAttendanceService';
import { CheckCircle2, Clock, XCircle, Award } from 'lucide-react';

export const StatisticsPage: React.FC = () => {
  const { activeChild } = useAuth();
  const [metrics, setMetrics] = useState<StudentAttendanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);
    fetchStudentStatistics(activeChild.student_id).then((res) => {
      setMetrics(res);
      setLoading(false);
    });
  }, [activeChild]);

  if (!activeChild) return null;

  const childName = `${activeChild.first_name} ${activeChild.last_name}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance Statistics</h2>
        <p className="text-sm text-slate-500">
          Cumulative attendance performance and punctuality analytics for{' '}
          <strong className="text-slate-800">{childName}</strong>.
        </p>
      </div>

      {loading || !metrics ? (
        <LoadingState message="Computing attendance analytics..." />
      ) : (
        <div className="space-y-6">
          {/* Rate Highlights */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Card className="border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-blue-200">
                    Overall Attendance Rate
                  </span>
                  <Award className="h-6 w-6 text-blue-200" />
                </div>
                <div className="text-4xl font-extrabold">{metrics.attendance_rate_percentage}%</div>
                <p className="text-xs text-blue-100">
                  {metrics.attendance_rate_percentage >= 95
                    ? 'Outstanding! Meets MNHS honors attendance standard.'
                    : 'Good attendance standing.'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-amber-200">
                    Tardiness / Late Rate
                  </span>
                  <Clock className="h-6 w-6 text-amber-200" />
                </div>
                <div className="text-4xl font-extrabold">{metrics.tardiness_rate_percentage}%</div>
                <p className="text-xs text-amber-100">
                  {metrics.late_days} instances of late arrival recorded.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Counts */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total School Days</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {metrics.total_school_days}
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-emerald-700 uppercase flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Present Days
                </span>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {metrics.present_days}
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-amber-700 uppercase flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Late Days
                </span>
                <div className="text-2xl font-bold text-amber-700 mt-1">
                  {metrics.late_days}
                </div>
              </CardContent>
            </Card>

            <Card className="border-rose-200 bg-rose-50/40">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-rose-700 uppercase flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Absent Days
                </span>
                <div className="text-2xl font-bold text-rose-700 mt-1">
                  {metrics.absent_days}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">MNHS Academic Standing Summary</CardTitle>
              <Badge variant="success" size="sm">Good Standing</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                Student is currently enrolled in <strong>{formatGradeSection(activeChild.grade_level, activeChild.section_name)}</strong> for School Year 2026-2027.
              </p>
              <p>

                MNHS standard requires students to maintain above 80% attendance throughout the school year. Current attendance rate is <strong>{metrics.attendance_rate_percentage}%</strong>.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
