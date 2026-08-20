import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@qr-attendance/ui';

export const NotificationsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance Notifications</h2>
        <p className="text-sm text-slate-500">
          History of push alerts received for Juan Dela Cruz and Maria Dela Cruz.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4 bg-emerald-50/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">Attendance Recorded</h4>
                <span className="text-xs text-slate-400">Today at 7:42 AM</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Juan Dela Cruz was marked PRESENT today at 7:42 AM (Grade 12 STEM A).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4 bg-amber-50/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">Attendance Update</h4>
                <span className="text-xs text-slate-400">Aug 18, 7:58 AM</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Juan Dela Cruz was marked LATE today at 7:58 AM (Grade 12 STEM A).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
