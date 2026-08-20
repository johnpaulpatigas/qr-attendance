import React from 'react';
import { Plus, Users, BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@qr-attendance/ui';

export const ClassesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Classes & Sections</h2>
          <p className="text-sm text-slate-500">
            Manage your advisory and subject classes for School Year 2026-2027.
          </p>
        </div>
        <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
          Add Class Section
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Grade 12
              </span>
              <BookOpen className="h-4 w-4 text-slate-400" />
            </div>
            <CardTitle className="text-lg">STEM A</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-400" /> Students Enrolled
              </span>
              <span className="font-bold text-slate-900">45</span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm">
                View Roster
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
