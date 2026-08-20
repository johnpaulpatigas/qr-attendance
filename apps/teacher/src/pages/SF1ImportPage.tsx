import React from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@qr-attendance/ui';

export const SF1ImportPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">DepEd SF1 Importer</h2>
        <p className="text-sm text-slate-500">
          Upload official DepEd School Form 1 (SF1) spreadsheet (.xlsx, .csv) to seed or update student rosters.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Select SF1 Spreadsheet</CardTitle>
          <CardDescription>
            The importer will automatically detect headers, validate 12-digit LRNs, flag duplicates, and preview parsed students before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer">
            <UploadCloud className="h-10 w-10 text-slate-400 mb-3" />
            <h4 className="text-sm font-semibold text-slate-700">
              Drag and drop DepEd SF1 file here, or browse
            </h4>
            <p className="mt-1 text-xs text-slate-500">Supports .xlsx, .xls, and .csv files</p>
            <Button size="sm" variant="outline" className="mt-4" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
              Browse Files
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supported SF1 Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>Learner Reference No. (LRN)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>Full Name (Last, First, Middle)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>Sex & Birth Date</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>Grade Level & Section</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
