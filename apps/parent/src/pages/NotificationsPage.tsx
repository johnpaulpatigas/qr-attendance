import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  LoadingState,
  Button,
} from '@qr-attendance/ui';
import { useAuth } from '../features/auth';
import { fetchStudentNotificationLogs } from '../features/attendance/parentAttendanceService';
import { requestPushPermissionAndRegister } from '../features/notifications/fcmService';
import type { NotificationLog } from '@qr-attendance/types';

export const NotificationsPage: React.FC = () => {
  const { user, activeChild } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);
    fetchStudentNotificationLogs(activeChild.student_id).then((res) => {
      setLogs(res);
      setLoading(false);
    });
  }, [activeChild]);

  const requestNotificationPermission = async () => {
    if (!user) return;
    const token = await requestPushPermissionAndRegister(user.id, activeChild?.student_id);
    if (token) {
      setPushStatusMessage('Push notifications enabled for this device.');
    } else {
      setPushStatusMessage('Push notifications are not supported or were denied.');
    }
  };

  if (!activeChild) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance Notifications</h2>
          <p className="text-sm text-slate-500">
            Real-time push alert delivery history for{' '}
            <strong className="text-slate-800">
              {activeChild.first_name} {activeChild.last_name}
            </strong>
            .
          </p>
        </div>
        <div>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Bell className="h-4 w-4" />}
            onClick={requestNotificationPermission}
          >
            Enable Device Push Alerts
          </Button>
          {pushStatusMessage && (
            <p className="mt-1 text-right text-xs text-slate-500">{pushStatusMessage}</p>
          )}
        </div>
      </div>

      {/* Push Status Banner */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-900">Instant Parent Alerts Active</h4>
              <p className="text-xs text-blue-700">
                You receive instant FCM notifications whenever your student's QR code is scanned in
                class.
              </p>
            </div>
          </div>
          <Badge variant="info" size="sm">
            Active
          </Badge>
        </CardContent>
      </Card>

      {/* Notification Logs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Push Alert History</CardTitle>
          <Badge variant="outline" size="sm">
            {logs.length} Delivered
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState message="Loading notification logs..." />
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No notifications logged yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const isPresent = log.notification_type === 'attendance_present';
                const isLate = log.notification_type === 'attendance_late';
                return (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-4 transition-colors hover:bg-slate-50/50"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl text-white ${
                          isPresent ? 'bg-emerald-600' : isLate ? 'bg-amber-600' : 'bg-rose-600'
                        }`}
                      >
                        {isPresent ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isLate ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-900">
                          {isPresent
                            ? `${activeChild.first_name} marked PRESENT`
                            : isLate
                              ? `${activeChild.first_name} marked LATE`
                              : `${activeChild.first_name} attendance notice`}
                        </p>
                        <p className="text-xs text-slate-500">
                          Delivered via Firebase Cloud Messaging push service
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {new Date(log.created_at).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={log.status === 'sent' ? 'success' : 'warning'} size="sm">
                      {log.status === 'sent' ? 'Delivered' : log.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
