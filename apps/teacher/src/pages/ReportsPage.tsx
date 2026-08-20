import React from 'react';
import { Download, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Select } from '@qr-attendance/ui';

export const ReportsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance Reports</h2>
          <p className="text-sm text-slate-500">
            Generate and export attendance statistics, SF2 summaries, and logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" leftIcon={<FileText className="h-4 w-4" />}>
            Export XLSX
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Report Period"
              options={[
                { value: 'daily', label: 'Daily Attendance Report' },
                { value: 'weekly', label: 'Weekly Summary' },
                { value: 'monthly', label: 'Monthly SF2 Report' },
              ]}
            />
            <Select
              label="Class / Section"
              options={[
                { value: 'all', label: 'All Classes' },
                { value: '1', label: 'Grade 12 — STEM A' },
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
