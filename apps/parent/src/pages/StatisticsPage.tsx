import React from 'react';
import { Card, CardHeader, CardContent } from '@qr-attendance/ui';
import { CheckCircle2, Clock, XCircle, Award } from 'lucide-react';

export const StatisticsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance Statistics</h2>
        <p className="text-sm text-slate-500">
          Monthly and school-year attendance metrics for Juan Dela Cruz.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-emerald-100 bg-emerald-50/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 uppercase">Rate</span>
              <Award className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">96.8%</div>
            <p className="mt-1 text-xs text-emerald-600">School Year 26-27</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Present</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">19</div>
            <p className="mt-1 text-xs text-slate-500">Days this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-600 uppercase">Late</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">1</div>
            <p className="mt-1 text-xs text-amber-600">Days this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-600 uppercase">Absent</span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">0</div>
            <p className="mt-1 text-xs text-rose-600">Days this month</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
