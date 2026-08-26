import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  LoadingState,
} from '@qr-attendance/ui';
import { fetchClassSections } from '../features/attendance/attendanceSessionService';
import { formatGradeSection } from '@qr-attendance/validation';
import {
  generateSF2Report,
  fetchDailyReport,
  type SF2ReportData,
  type DailyReportRow,
} from '../features/reports/reportService';
import { exportSF2ToExcel, printSF2Document } from '../features/reports/sf2Exporter';
import type { ClassSectionWithDetails } from '@qr-attendance/types';
import { getUtc8DateString } from '@qr-attendance/validation';

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sf2' | 'daily'>('sf2');
  const [sections, setSections] = useState<ClassSectionWithDetails[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('8'); // August
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedDate, setSelectedDate] = useState(getUtc8DateString());

  const [sf2Data, setSf2Data] = useState<SF2ReportData | null>(null);
  const [dailyData, setDailyData] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClassSections().then((secs) => {
      setSections(secs);
      if (secs.length > 0 && !selectedClassId) {
        setSelectedClassId(secs[0].id);
      }
    });
  }, []);

  const loadReports = async () => {
    if (!selectedClassId) return;
    setLoading(true);

    if (activeTab === 'sf2') {
      const sf2 = await generateSF2Report(
        selectedClassId,
        Number(selectedYear),
        Number(selectedMonth)
      );
      setSf2Data(sf2);
    } else {
      const daily = await fetchDailyReport(selectedClassId, selectedDate);
      setDailyData(daily);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, [activeTab, selectedClassId, selectedMonth, selectedYear, selectedDate]);

  const handleExportExcel = () => {
    if (!sf2Data) return;
    exportSF2ToExcel(sf2Data);
  };

  const handlePrintSF2 = () => {
    if (!sf2Data) return;
    printSF2Document(sf2Data);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">MNHS Attendance Reports & SF2</h2>
          <p className="text-sm text-slate-500">
            Generate monthly School Form 2 (SF2) registers and daily attendance audits for
            Marigondon NHS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'sf2' && sf2Data && (
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="h-4 w-4" />}
                onClick={handlePrintSF2}
              >
                Print SF2 Register
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={handleExportExcel}
              >
                Export SF2 (.xlsx)
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('sf2')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'sf2'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          DepEd School Form 2 (Monthly SF2)
        </button>
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'daily'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Daily Attendance Log
        </button>
      </div>

      {/* Controls Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Select
              label="Select Class / Section"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              options={sections.map((s) => ({
                value: s.id,
                label: formatGradeSection(s.grade_level, s.section_name),
              }))}
            />

            {activeTab === 'sf2' ? (
              <>
                <Select
                  label="Month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  options={[
                    { value: '8', label: 'August' },
                    { value: '9', label: 'September' },
                    { value: '10', label: 'October' },
                    { value: '11', label: 'November' },
                    { value: '12', label: 'December' },
                    { value: '1', label: 'January' },
                    { value: '2', label: 'February' },
                    { value: '3', label: 'March' },
                  ]}
                />
                <Select
                  label="Year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  options={[
                    { value: '2026', label: '2026' },
                    { value: '2027', label: '2027' },
                  ]}
                />
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Report Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <LoadingState message="Compiling attendance reports and metrics..." />
          </CardContent>
        </Card>
      )}

      {/* Tab 1: DepEd SF2 Monthly View */}
      {!loading && activeTab === 'sf2' && sf2Data && (
        <div className="space-y-6">
          {/* SF2 Summary Stat Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase">
                  <Users className="h-3.5 w-3.5" /> Total Enrollment
                </span>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {sf2Data.totalEnrollment}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-4">
                <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 uppercase">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Average Daily (ADA)
                </span>
                <div className="mt-1 text-2xl font-bold text-blue-700">
                  {sf2Data.averageDailyAttendance}
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-4">
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 uppercase">
                  <TrendingUp className="h-3.5 w-3.5" /> Attendance Rate
                </span>
                <div className="mt-1 text-2xl font-bold text-emerald-700">
                  {sf2Data.attendancePercentage}%
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-4">
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 uppercase">
                  <Clock className="h-3.5 w-3.5" /> Total Tardy Days
                </span>
                <div className="mt-1 text-2xl font-bold text-amber-700">
                  {sf2Data.maleTotalTardy + sf2Data.femaleTotalTardy}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DepEd SF2 Interactive Table Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">
                  School Form 2 (SF2) — {sf2Data.sectionName} ({sf2Data.monthName} {sf2Data.year})
                </CardTitle>
                <p className="text-xs text-slate-400">
                  {sf2Data.schoolDays.length} School Days &bull; DepEd Standard Form
                </p>
              </div>
              <Badge variant="info" size="sm">
                SY {sf2Data.schoolYear}
              </Badge>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-28">LRN</TableHead>
                    <TableHead className="min-w-[180px]">Learner's Name</TableHead>
                    {sf2Data.schoolDays.slice(0, 15).map((d) => (
                      <TableHead key={d} className="w-7 p-1 text-center text-[10px]">
                        {d}
                      </TableHead>
                    ))}
                    {sf2Data.schoolDays.length > 15 && (
                      <TableHead className="w-10 text-center text-xs text-slate-400">...</TableHead>
                    )}
                    <TableHead className="w-12 text-center text-xs">ABS</TableHead>
                    <TableHead className="w-12 text-center text-xs">TAR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Male Learners Header */}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell colSpan={18} className="py-1.5 text-xs text-blue-900">
                      MALE LEARNERS ({sf2Data.maleStudents.length})
                    </TableCell>
                  </TableRow>
                  {sf2Data.maleStudents.map((r, idx) => {
                    const fullName =
                      `${r.student.last_name}, ${r.student.first_name} ${r.student.middle_name || ''} ${r.student.suffix || ''}`.trim();
                    return (
                      <TableRow key={r.student.id}>
                        <TableCell className="text-xs text-slate-400">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{r.student.lrn}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-900">
                          {fullName}
                        </TableCell>
                        {sf2Data.schoolDays.slice(0, 15).map((d) => {
                          const st = r.dailyStatus[d];
                          return (
                            <TableCell key={d} className="p-1 text-center text-[10px] font-bold">
                              {st === 'present' ? (
                                <span className="text-slate-400">/</span>
                              ) : st === 'late' ? (
                                <span className="text-amber-600">T</span>
                              ) : st === 'absent' ? (
                                <span className="text-rose-600">X</span>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          );
                        })}
                        {sf2Data.schoolDays.length > 15 && (
                          <TableCell className="text-center text-xs text-slate-400">...</TableCell>
                        )}
                        <TableCell className="text-center text-xs font-bold">
                          {r.totalAbsences}
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">
                          {r.totalTardy}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Female Learners Header */}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell colSpan={18} className="py-1.5 text-xs text-rose-900">
                      FEMALE LEARNERS ({sf2Data.femaleStudents.length})
                    </TableCell>
                  </TableRow>
                  {sf2Data.femaleStudents.map((r, idx) => {
                    const fullName =
                      `${r.student.last_name}, ${r.student.first_name} ${r.student.middle_name || ''} ${r.student.suffix || ''}`.trim();
                    return (
                      <TableRow key={r.student.id}>
                        <TableCell className="text-xs text-slate-400">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{r.student.lrn}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-900">
                          {fullName}
                        </TableCell>
                        {sf2Data.schoolDays.slice(0, 15).map((d) => {
                          const st = r.dailyStatus[d];
                          return (
                            <TableCell key={d} className="p-1 text-center text-[10px] font-bold">
                              {st === 'present' ? (
                                <span className="text-slate-400">/</span>
                              ) : st === 'late' ? (
                                <span className="text-amber-600">T</span>
                              ) : st === 'absent' ? (
                                <span className="text-rose-600">X</span>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          );
                        })}
                        {sf2Data.schoolDays.length > 15 && (
                          <TableCell className="text-center text-xs text-slate-400">...</TableCell>
                        )}
                        <TableCell className="text-center text-xs font-bold">
                          {r.totalAbsences}
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">
                          {r.totalTardy}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Daily Attendance Log */}
      {!loading && activeTab === 'daily' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              Daily Attendance Log —{' '}
              {new Date(selectedDate).toLocaleDateString([], {
                dateStyle: 'full',
              })}
            </CardTitle>
            <Badge variant="outline" size="sm">
              {dailyData.length} Students
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LRN</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>Attendance Status</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Recording Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyData.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="font-mono text-xs">{row.lrn}</TableCell>
                    <TableCell className="font-medium text-slate-900">{row.studentName}</TableCell>
                    <TableCell className="text-xs uppercase">{row.sex}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'present'
                            ? 'success'
                            : row.status === 'late'
                              ? 'warning'
                              : row.status === 'absent'
                                ? 'danger'
                                : 'outline'
                        }
                        size="sm"
                        className="capitalize"
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {row.recordedAt
                        ? new Date(row.recordedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 uppercase">
                      {row.source.replace('_', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
