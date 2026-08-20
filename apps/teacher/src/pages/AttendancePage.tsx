import React, { useState } from 'react';
import { QrCode, Play, Users, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Select, Badge } from '@qr-attendance/ui';

export const AttendancePage: React.FC = () => {
  const [selectedClass, setSelectedClass] = useState('1');
  const [sessionType, setSessionType] = useState('morning');
  const [isScanning, setIsScanning] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance Scanner</h2>
          <p className="text-sm text-slate-500">
            Select a class and session to begin real-time QR attendance scanning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Session: Active</Badge>
        </div>
      </div>

      {/* Class & Session Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Select Class / Section"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              options={[
                { value: '1', label: 'Grade 12 — STEM A' },
                { value: '2', label: 'Grade 11 — ABM B' },
                { value: '3', label: 'Grade 10 — Rizal' },
              ]}
            />
            <Select
              label="Session Type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              options={[
                { value: 'morning', label: 'Morning Session' },
                { value: 'afternoon', label: 'Afternoon Session' },
                { value: 'whole_day', label: 'Whole Day' },
              ]}
            />
            <div className="flex items-end">
              <Button
                className="w-full"
                size="md"
                variant={isScanning ? 'danger' : 'primary'}
                leftIcon={isScanning ? <QrCode className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                onClick={() => setIsScanning(!isScanning)}
              >
                {isScanning ? 'Stop Camera' : 'Start Camera Scanner'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanner Viewport Area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Camera Viewport</span>
                <span className="text-xs font-normal text-slate-500">
                  Hold student QR code up to camera
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-900 text-white relative overflow-hidden">
                {isScanning ? (
                  <div className="text-center space-y-2">
                    <div className="h-48 w-48 border-2 border-blue-500 rounded-2xl mx-auto flex items-center justify-center animate-pulse">
                      <QrCode className="h-16 w-16 text-blue-400 opacity-60" />
                    </div>
                    <p className="text-xs text-slate-400">Scanning in progress...</p>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <QrCode className="h-12 w-12 text-slate-500 mx-auto" />
                    <p className="text-sm font-medium text-slate-300">
                      Camera scanner is currently inactive
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsScanning(true)}
                    >
                      Activate Camera
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Counters & Last Scan Feedback */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Counters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4 text-slate-400" /> Total Students
                </span>
                <span className="font-bold text-slate-900">45</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Present
                </span>
                <span className="font-bold text-emerald-700">38</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-sm text-amber-600">
                  <Clock className="h-4 w-4" /> Late
                </span>
                <span className="font-bold text-amber-700">3</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last Scanned Student</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4 text-sm text-slate-500">
                Ready for scan.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
