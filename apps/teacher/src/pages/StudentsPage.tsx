import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Printer, FileSpreadsheet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Badge, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@qr-attendance/ui';

export const StudentsPage: React.FC = () => {
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Student Directory</h2>
          <p className="text-sm text-slate-500">
            Manage student records, view generated QR identifiers, and print ID cards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/students/import-sf1">
            <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
              Import SF1
            </Button>
          </Link>
          <Button variant="outline" size="sm" leftIcon={<Printer className="h-4 w-4" />}>
            Print All QRs
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            Add Student
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              placeholder="Search by name or LRN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
            <Select
              options={[
                { value: 'all', label: 'All Grade Levels' },
                { value: '12', label: 'Grade 12' },
                { value: '11', label: 'Grade 11' },
                { value: '10', label: 'Grade 10' },
              ]}
            />
            <Select
              options={[
                { value: 'all', label: 'All Sections' },
                { value: 'stem-a', label: 'STEM A' },
                { value: 'abm-b', label: 'ABM B' },
                { value: 'rizal', label: 'Rizal' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Students Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrolled Students</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LRN</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Sex</TableHead>
                <TableHead>Grade & Section</TableHead>
                <TableHead>QR Identifier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs font-semibold">108234981234</TableCell>
                <TableCell className="font-medium text-slate-900">Dela Cruz, Juan M.</TableCell>
                <TableCell>Male</TableCell>
                <TableCell>Grade 12 — STEM A</TableCell>
                <TableCell>
                  <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                    ATTENDANCE:a1b2c3d4...
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">
                    View QR
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
