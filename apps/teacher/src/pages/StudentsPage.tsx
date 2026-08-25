import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Printer, FileSpreadsheet, QrCode } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  LoadingState,
  EmptyState,
} from '@qr-attendance/ui';
import type { StudentWithSection, ClassSectionWithDetails } from '@qr-attendance/types';
import { fetchStudents } from '../features/students/studentService';
import { fetchClassSections } from '../features/attendance/attendanceSessionService';
import { StudentQrModal } from '../features/qr/StudentQrModal';
import { AddStudentModal } from '../features/students/AddStudentModal';
import { printBatchStudentQrCards } from '../features/qr/qrUtils';

export const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<StudentWithSection[]>([]);
  const [sections, setSections] = useState<ClassSectionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');

  const [selectedStudentForQr, setSelectedStudentForQr] = useState<StudentWithSection | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);

  useEffect(() => {
    fetchClassSections().then((secs) => {
      setSections(secs);
    });
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchStudents({
      search,
      gradeLevel: gradeFilter !== 'all' ? Number(gradeFilter) : undefined,
      sectionId: sectionFilter !== 'all' ? sectionFilter : undefined,
    });
    setStudents(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [search, gradeFilter, sectionFilter]);

  const handleBatchPrint = async () => {
    if (students.length === 0) return;
    setIsBatchPrinting(true);
    try {
      await printBatchStudentQrCards(students);
    } finally {
      setIsBatchPrinting(false);
    }
  };

  const handleStudentUpdated = (updated: StudentWithSection) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedStudentForQr(updated);
  };

  const handleStudentCreated = (newStudent: StudentWithSection) => {
    setStudents((prev) => [newStudent, ...prev]);
    setSelectedStudentForQr(newStudent);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
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
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer className="h-4 w-4" />}
            onClick={handleBatchPrint}
            isLoading={isBatchPrinting}
            disabled={students.length === 0}
          >
            Print Filtered QRs ({students.length})
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsAddModalOpen(true)}
          >
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
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Grade Levels' },
                { value: '7', label: 'Grade 7' },
                { value: '8', label: 'Grade 8' },
                { value: '9', label: 'Grade 9' },
                { value: '10', label: 'Grade 10' },
                { value: '11', label: 'Grade 11' },
                { value: '12', label: 'Grade 12' },
              ]}
            />
            <Select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Sections' },
                ...sections.map((s) => ({
                  value: s.id,
                  label: `Grade ${s.grade_level} — ${s.section_name}`,
                })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Students Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            Enrolled Students ({students.length})
          </CardTitle>
          <Badge variant="info" size="sm">SY 2026-2027</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState message="Loading student records..." />
          ) : students.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No students found"
                description="Try adjusting your search query or grade/section filters, or click Add Student to register."
                action={{
                  label: 'Add Student',
                  onClick: () => setIsAddModalOpen(true),
                }}
              />
            </div>
          ) : (
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
                {students.map((student) => {
                  const fullName = `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.suffix || ''}`.trim();
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-800">
                        {student.lrn}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {fullName}
                      </TableCell>
                      <TableCell className="capitalize text-xs text-slate-600">
                        {student.sex.toLowerCase()}
                      </TableCell>
                      <TableCell className="text-sm">
                        Grade {student.grade_level} — {student.section_name || 'Section'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm" className="font-mono text-[10px] truncate max-w-[140px]">
                          ATTENDANCE:{student.qr_identifier.slice(0, 8)}...
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<QrCode className="h-3.5 w-3.5" />}
                          onClick={() => setSelectedStudentForQr(student)}
                        >
                          View QR
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* QR Display / Print Modal */}
      <StudentQrModal
        student={selectedStudentForQr}
        isOpen={Boolean(selectedStudentForQr)}
        onClose={() => setSelectedStudentForQr(null)}
        onStudentUpdated={handleStudentUpdated}
      />

      {/* Add Student Modal */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onStudentCreated={handleStudentCreated}
      />
    </div>
  );
};
