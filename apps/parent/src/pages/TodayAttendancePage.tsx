import React from 'react';
import { CheckCircle2, Clock, MapPin, User } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@qr-attendance/ui';

export const TodayAttendancePage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Active Child Summary Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Today's Attendance</h2>
          <p className="text-sm text-slate-500">
            Real-time status for <strong className="text-slate-800">Juan Dela Cruz</strong> (LRN: 108234981234)
          </p>
        </div>
        <Badge variant="success" size="md" className="self-start sm:self-auto">
          Present Today
        </Badge>
      </div>

      {/* Main Status Hero Card */}
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Morning Session &bull; Recorded via QR Scan
              </span>
              <h3 className="text-xl font-bold text-slate-900">Marked PRESENT at 7:42 AM</h3>
              <p className="text-sm text-slate-600">
                Scanned by <span className="font-medium text-slate-900">Teacher Cruz</span> at Grade 12 — STEM A
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Details */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Morning Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" /> Time In
              </span>
              <span className="font-semibold text-emerald-700">7:42 AM (On Time)</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" /> Recorded By
              </span>
              <span className="font-medium text-slate-900">Adviser / Teacher Cruz</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" /> Classroom
              </span>
              <span className="font-medium text-slate-900">Room 302, Building B</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Afternoon Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" /> Time In
              </span>
              <span className="font-medium text-slate-400">Scheduled 1:00 PM</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" /> Status
              </span>
              <Badge variant="outline" size="sm">Pending Scan</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
