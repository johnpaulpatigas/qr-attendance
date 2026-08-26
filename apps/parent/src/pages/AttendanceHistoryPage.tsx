import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  LoadingState,
} from '@qr-attendance/ui';
import { useAuth } from '../features/auth/AuthContext';
import { fetchAttendanceHistory } from '../features/attendance/parentAttendanceService';
import type { AttendanceRecord } from '@qr-attendance/types';

export const AttendanceHistoryPage: React.FC = () => {
  const { activeChild } = useAuth();
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);
    fetchAttendanceHistory(activeChild.student_id).then((records) => {
      setHistory(records);
      setLoading(false);
    });
  }, [activeChild]);

  if (!activeChild) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance History</h2>
        <p className="text-sm text-slate-500">
          Monthly chronological log of past attendance records for{' '}
          <strong className="text-slate-800">
            {activeChild.first_name} {activeChild.last_name}
          </strong>{' '}
          (LRN: {activeChild.lrn}).
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">School Year 2026-2027</CardTitle>
          <Badge variant="info" size="sm">
            {history.length} Scans Logged
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState message="Loading historical attendance logs..." />
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No historical records found for this student.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method / Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-medium text-slate-900">
                      {new Date(rec.attendance_date).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="capitalize">{rec.attendance_type}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {new Date(rec.recorded_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rec.status === 'present'
                            ? 'success'
                            : rec.status === 'late'
                              ? 'warning'
                              : rec.status === 'absent'
                                ? 'danger'
                                : 'outline'
                        }
                        size="sm"
                        className="capitalize"
                      >
                        {rec.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 uppercase">
                      {rec.source.replace('_', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
