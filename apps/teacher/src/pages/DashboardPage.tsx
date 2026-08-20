import React from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@qr-attendance/ui';

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Today's Attendance</h2>
          <p className="mt-1 text-sm text-blue-100">
            Grade 12 — STEM A &bull; Morning Session
          </p>
        </div>
        <Link to="/attendance">
          <Button
            size="lg"
            className="w-full sm:w-auto bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md"
            leftIcon={<QrCode className="h-5 w-5" />}
          >
            Start Scanning
          </Button>
        </Link>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Enrolled
              </span>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">45</div>
            <p className="mt-1 text-xs text-slate-500">Students in class</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Present
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">38</div>
            <p className="mt-1 text-xs text-emerald-600">84.4% attendance</p>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-amber-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Late
              </span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">3</div>
            <p className="mt-1 text-xs text-amber-600">After 7:45 AM</p>
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-rose-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                Absent
              </span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">2</div>
            <p className="mt-1 text-xs text-rose-600">Unexcused</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1 border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Unrecorded
              </span>
              <HelpCircle className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">2</div>
            <p className="mt-1 text-xs text-slate-500">Pending scan</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 p-4 hover:bg-slate-50 transition-colors">
              <div>
                <h4 className="font-semibold text-slate-900">Grade 12 — STEM A</h4>
                <p className="text-xs text-slate-500">45 Students &bull; Advisory Class</p>
              </div>
              <Link to="/attendance">
                <Button size="sm" variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Open
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-500 text-center py-6">
              No scans recorded yet for the current session.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
