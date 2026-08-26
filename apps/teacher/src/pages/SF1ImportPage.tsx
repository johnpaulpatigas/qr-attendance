import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Printer,
  RotateCcw,
  Users,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  LoadingState,
} from '@qr-attendance/ui';
import type { SF1ImportSummary } from '@qr-attendance/types';
import { formatGradeSection } from '@qr-attendance/validation';
import { parseSF1Spreadsheet, type ParseSF1Result } from '../features/sf1/sf1Parser';
import { validateSF1Records, type SF1ValidationSummary } from '../features/sf1/sf1Validator';
import { executeSF1Import } from '../features/sf1/sf1ImportService';

export const SF1ImportPage: React.FC = () => {
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseSF1Result | null>(null);
  const [validationSummary, setValidationSummary] = useState<SF1ValidationSummary | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<SF1ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File) => {
    setError(null);
    setIsParsing(true);
    setImportSummary(null);

    try {
      const parsed = await parseSF1Spreadsheet(selectedFile);
      setParseResult(parsed);

      const validated = await validateSF1Records(parsed.records);
      setValidationSummary(validated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse SF1 spreadsheet.');
      setParseResult(null);
      setValidationSummary(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!validationSummary) return;
    setIsImporting(true);
    try {
      const summary = await executeSF1Import(validationSummary.records);
      setImportSummary(summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setParseResult(null);
    setValidationSummary(null);
    setImportSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredRecords =
    validationSummary?.records.filter((r) => {
      if (filterTab === 'valid') return r.isValid;
      if (filterTab === 'invalid') return !r.isValid;
      return true;
    }) || [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">MNHS SF1 Importer</h2>
          <p className="text-sm text-slate-500">
            Import official School Form 1 (SF1) student lists (.xlsx, .xls, .csv) into Marigondon
            NHS sections.
          </p>
        </div>
        {validationSummary && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            leftIcon={<RotateCcw className="h-4 w-4" />}
          >
            Upload Another File
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Step 1: Upload Dropzone (When no file is parsed yet) */}
      {!parseResult && !isParsing && !importSummary && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Upload MNHS / DepEd SF1 Spreadsheet</CardTitle>
              <CardDescription>
                Upload your class SF1 file. The system will automatically detect student names,
                12-digit LRNs, sex, birth dates, and section info.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-12 text-center transition-all hover:border-blue-500 hover:bg-blue-50/20"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h4 className="text-base font-semibold text-slate-800">
                  Click to select file or drag & drop MNHS SF1 here
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Accepts standard School Form 1 (.xlsx, .xls, .csv)
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-5"
                  leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                >
                  Select File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state while parsing */}
      {isParsing && (
        <Card>
          <CardContent className="py-12">
            <LoadingState message="Parsing spreadsheet headers and validating records..." />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Validation Preview & Metric Summary */}
      {validationSummary && !importSummary && (
        <div className="space-y-6">
          {/* Stat Metric Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Rows</span>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {validationSummary.totalRows}
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-emerald-700 uppercase">
                  Valid Records
                </span>
                <div className="mt-1 text-2xl font-bold text-emerald-700">
                  {validationSummary.validRows}
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                validationSummary.invalidRows > 0
                  ? 'border-rose-200 bg-rose-50/30'
                  : 'border-slate-200'
              }
            >
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-rose-700 uppercase">
                  Invalid Records
                </span>
                <div className="mt-1 text-2xl font-bold text-rose-700">
                  {validationSummary.invalidRows}
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                validationSummary.duplicateCount > 0
                  ? 'border-amber-200 bg-amber-50/30'
                  : 'border-slate-200'
              }
            >
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-amber-700 uppercase">
                  Duplicate LRNs
                </span>
                <div className="mt-1 text-2xl font-bold text-amber-700">
                  {validationSummary.duplicateCount}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterTab('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterTab === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Rows ({validationSummary.totalRows})
              </button>
              <button
                onClick={() => setFilterTab('valid')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterTab === 'valid'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Valid ({validationSummary.validRows})
              </button>
              <button
                onClick={() => setFilterTab('invalid')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterTab === 'invalid'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Errors ({validationSummary.invalidRows})
              </button>
            </div>

            <Button
              variant="primary"
              size="md"
              isLoading={isImporting}
              disabled={validationSummary.validRows === 0}
              onClick={handleExecuteImport}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Confirm Import ({validationSummary.validRows} Students)
            </Button>
          </div>

          {/* Preview Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Spreadsheet Row Preview & Validation</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>LRN</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Grade & Section</TableHead>
                    <TableHead>Validation Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r) => {
                    const fullName =
                      `${r.data.last_name}, ${r.data.first_name} ${r.data.middle_name || ''} ${r.data.suffix || ''}`.trim();
                    return (
                      <TableRow
                        key={r.rowIndex}
                        className={!r.isValid ? 'bg-rose-50/30' : undefined}
                      >
                        <TableCell className="font-mono text-xs text-slate-500">
                          #{r.rowIndex}
                        </TableCell>
                        <TableCell>
                          {r.isValid ? (
                            <Badge variant="success" size="sm">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Valid
                            </Badge>
                          ) : (
                            <Badge variant="danger" size="sm">
                              <XCircle className="mr-1 h-3 w-3" /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">
                          {r.raw.lrn}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          {fullName || '(Missing Name)'}
                        </TableCell>
                        <TableCell className="text-xs">{r.data.sex}</TableCell>
                        <TableCell className="text-xs">
                          {formatGradeSection(r.data.grade_level, r.data.section_name)}
                        </TableCell>

                        <TableCell className="text-xs">
                          {r.errors.length > 0 && (
                            <div className="space-y-0.5 font-medium text-rose-600">
                              {r.errors.map((e, idx) => (
                                <p key={idx}>&bull; {e}</p>
                              ))}
                            </div>
                          )}
                          {r.warnings.length > 0 && (
                            <div className="space-y-0.5 text-[11px] text-amber-600">
                              {r.warnings.map((w, idx) => (
                                <p key={idx}>&bull; {w}</p>
                              ))}
                            </div>
                          )}
                          {r.errors.length === 0 && r.warnings.length === 0 && (
                            <span className="text-slate-400">Ready to insert</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Final Import Summary & Actions */}
      {importSummary && (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-500/5 to-teal-500/10 shadow-lg">
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl text-emerald-900">
              SF1 Import Completed Successfully
            </CardTitle>
            <CardDescription className="text-emerald-700">
              Student identities and QR identifiers have been generated and recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <span className="text-xs text-slate-500">Processed</span>
                <div className="text-xl font-bold text-slate-900">
                  {importSummary.total_rows} rows
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <span className="text-xs text-emerald-600">Created</span>
                <div className="text-xl font-bold text-emerald-700">
                  {importSummary.created_students} new
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <span className="text-xs text-blue-600">Updated</span>
                <div className="text-xl font-bold text-blue-700">
                  {importSummary.updated_students} existing
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <span className="text-xs text-slate-500">Skipped Errors</span>
                <div className="text-xl font-bold text-slate-700">{importSummary.invalid_rows}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/students">
                <Button variant="primary" leftIcon={<Users className="h-4 w-4" />}>
                  View Student Directory
                </Button>
              </Link>
              <Link to="/students">
                <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />}>
                  Print Class QR Codes
                </Button>
              </Link>
              <Button variant="ghost" onClick={handleReset}>
                Import Another Sheet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
