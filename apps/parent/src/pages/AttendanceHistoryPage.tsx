import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@qr-attendance/ui';

export const AttendanceHistoryPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance History</h2>
        <p className="text-sm text-slate-500">
          Monthly log and record of past attendance scans for Juan Dela Cruz.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">August 2026</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Time In</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recorded Via</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-slate-900">Aug 20, 2026</TableCell>
                <TableCell>Morning</TableCell>
                <TableCell>7:42 AM</TableCell>
                <TableCell>
                  <Badge variant="success" size="sm">Present</Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-xs">QR Scanner</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-slate-900">Aug 19, 2026</TableCell>
                <TableCell>Morning</TableCell>
                <TableCell>7:40 AM</TableCell>
                <TableCell>
                  <Badge variant="success" size="sm">Present</Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-xs">QR Scanner</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-slate-900">Aug 18, 2026</TableCell>
                <TableCell>Morning</TableCell>
                <TableCell>7:58 AM</TableCell>
                <TableCell>
                  <Badge variant="warning" size="sm">Late</Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-xs">QR Scanner</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
