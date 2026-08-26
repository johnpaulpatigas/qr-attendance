import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, BookOpen, QrCode, Award, BookCheck, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Modal,
  Input,
  Select,
  Badge,
  LoadingState,
  EmptyState,
} from '@qr-attendance/ui';
import { getSupabaseClient } from '@qr-attendance/supabase';
import type { ClassSectionWithDetails, SectionSubjectTeacher } from '@qr-attendance/types';
import { formatGradeSection, cleanSectionName } from '@qr-attendance/validation';
import { useAuth } from '../features/auth';
import {
  fetchClassSections,
  claimClassSection,
  assignSubjectTeacher,
  removeSubjectTeacher,
} from '../features/attendance/attendanceSessionService';

const HIGH_SCHOOL_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Filipino',
  'Araling Panlipunan (AP)',
  'MAPEH (Music, Arts, PE, Health)',
  'Technology and Livelihood Education (TLE)',
  'Edukasyon sa Pagpapakatao (EsP)',
  'Homeroom Guidance',
  'Research / Special Science',
  'Elective',
];

interface TeacherOption {
  id: string;
  full_name: string;
  email?: string;
}

export const ClassesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [classes, setClasses] = useState<ClassSectionWithDetails[]>([]);
  const [teachersList, setTeachersList] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState<string>('10');
  const [sectionName, setSectionName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  // Subject Teacher Assignment Modal state
  const [selectedClassForSubjects, setSelectedClassForSubjects] =
    useState<ClassSectionWithDetails | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('Mathematics');
  const [customSubjectName, setCustomSubjectName] = useState('');
  const [assignedTeacherId, setAssignedTeacherId] = useState(user?.id || '');
  const [scheduleTime, setScheduleTime] = useState('');
  const [assigningSubject, setAssigningSubject] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const data = await fetchClassSections();
      setClasses(data);

      // Also load teacher profiles for subject assignment dropdown
      const client = getSupabaseClient();
      const { data: teachers } = await client
        .from('profiles')
        .select('id, full_name')
        .in('role', ['teacher', 'admin'])
        .order('full_name', { ascending: true });

      if (teachers) {
        setTeachersList(teachers);
      }
    } catch (err) {
      console.error('Error loading classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionName.trim()) {
      setFormError('Section name is required.');
      return;
    }

    setCreating(true);
    setFormError(null);
    const client = getSupabaseClient();

    try {
      let syId: string | null = null;
      const { data: activeSy } = await client
        .from('school_years')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (activeSy) {
        syId = activeSy.id;
      } else {
        const { data: firstSy } = await client
          .from('school_years')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (firstSy) {
          syId = firstSy.id;
        } else {
          const { data: newSy, error: syErr } = await client
            .from('school_years')
            .insert({
              name: '2026-2027',
              start_date: '2026-08-01',
              end_date: '2027-05-31',
              is_active: true,
            })
            .select()
            .single();

          if (syErr) throw new Error(syErr.message);
          syId = newSy.id;
        }
      }

      const cleanName = cleanSectionName(sectionName) || sectionName.trim();
      const { error: insertErr } = await client.from('class_sections').insert({
        school_year_id: syId || '',
        grade_level: Number(gradeLevel),
        section_name: cleanName,
        room_number: roomNumber.trim() || null,
        teacher_id: user?.id || null,
        adviser_id: user?.id || null,
      });

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      setIsAddModalOpen(false);
      setSectionName('');
      setRoomNumber('');
      loadClasses();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create class section.');
    } finally {
      setCreating(false);
    }
  };

  const handleClaimClass = async (classId: string) => {
    const res = await claimClassSection(classId);
    if (res.success) {
      loadClasses();
    } else {
      alert(res.error || 'Failed to claim section.');
    }
  };

  const handleAssignSubjectTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassForSubjects) return;

    const finalSubject = newSubjectName === 'Custom' ? customSubjectName.trim() : newSubjectName;
    if (!finalSubject) {
      setSubjectError('Please provide a subject name.');
      return;
    }

    setAssigningSubject(true);
    setSubjectError(null);

    const res = await assignSubjectTeacher(
      selectedClassForSubjects.id,
      finalSubject,
      assignedTeacherId || user?.id || '',
      scheduleTime.trim() || null
    );

    if (res.success) {
      setCustomSubjectName('');
      setScheduleTime('');
      await loadClasses();
      // Refresh current modal section
      const updated = (await fetchClassSections()).find(
        (s) => s.id === selectedClassForSubjects.id
      );
      if (updated) setSelectedClassForSubjects(updated);
    } else {
      setSubjectError(res.error || 'Failed to assign subject teacher.');
    }
    setAssigningSubject(false);
  };

  const handleRemoveSubject = async (assignmentId: string) => {
    if (!selectedClassForSubjects) return;
    const res = await removeSubjectTeacher(assignmentId);
    if (res.success) {
      await loadClasses();
      const updated = (await fetchClassSections()).find(
        (s) => s.id === selectedClassForSubjects.id
      );
      if (updated) setSelectedClassForSubjects(updated);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Classes & Sections</h2>
          <p className="text-sm text-slate-500">
            Manage your homeroom advisory sections and subject teaching assignments.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsAddModalOpen(true)}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Add Class Section
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading class sections..." />
      ) : classes.length === 0 ? (
        <EmptyState
          title="No Class Sections Registered"
          description="Create your first class section to begin managing student enrollments and subject attendance."
          action={{
            label: 'Create Class Section',
            onClick: () => setIsAddModalOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => {
            const isMyAdvisory = cls.my_role === 'adviser';
            const isUnassigned = !cls.adviser_id && !cls.teacher_id;
            const subjectTeachers = cls.subject_teachers || [];

            return (
              <Card
                key={cls.id}
                className="flex flex-col justify-between transition-shadow hover:shadow-md"
              >
                <div>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wider text-blue-600 uppercase">
                        Grade {cls.grade_level}
                      </span>
                      {isMyAdvisory ? (
                        <Badge variant="success" size="sm" className="flex items-center gap-1">
                          <Award className="h-3 w-3" /> Class Adviser
                        </Badge>
                      ) : cls.my_role === 'subject_teacher' ? (
                        <Badge variant="info" size="sm" className="flex items-center gap-1">
                          <BookCheck className="h-3 w-3" /> {cls.my_subject}
                        </Badge>
                      ) : isUnassigned ? (
                        <Badge variant="warning" size="sm">
                          Unassigned
                        </Badge>
                      ) : null}
                    </div>
                    <CardTitle className="text-lg">{cleanSectionName(cls.section_name)}</CardTitle>
                    {cls.room_number && (
                      <p className="text-xs font-medium text-slate-400">Room {cls.room_number}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-slate-400" /> Students Enrolled
                      </span>
                      <span className="font-bold text-slate-900">{cls.student_count}</span>
                    </div>

                    {/* Subject Teachers Preview */}
                    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5 text-blue-600" /> Subject Teachers (
                          {subjectTeachers.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedClassForSubjects(cls)}
                          className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Manage
                        </button>
                      </div>
                      {subjectTeachers.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">
                          No subject teachers assigned yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {subjectTeachers.slice(0, 3).map((st) => (
                            <span
                              key={st.id}
                              className="inline-flex items-center rounded border border-blue-200/60 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                            >
                              {st.subject_name}
                            </span>
                          ))}
                          {subjectTeachers.length > 3 && (
                            <span className="inline-flex items-center pl-1 text-[10px] font-medium text-slate-500">
                              +{subjectTeachers.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4 pt-2">
                  {isUnassigned ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-400 text-amber-800 hover:bg-amber-50"
                      onClick={() => handleClaimClass(cls.id)}
                      leftIcon={<ShieldCheck className="h-3.5 w-3.5 text-amber-600" />}
                    >
                      Claim Section
                    </Button>
                  ) : (
                    <div className="max-w-[120px] truncate text-xs text-slate-500">
                      {isMyAdvisory ? 'Your Advisory' : 'Teaching Subject'}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Link to={`/students?section=${cls.id}&grade=${cls.grade_level}`}>
                      <Button variant="outline" size="sm">
                        Roster
                      </Button>
                    </Link>
                    <Link to={`/attendance`}>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<QrCode className="h-3.5 w-3.5" />}
                      >
                        Scan
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Class Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Class Section"
        description="Register a new section and assign the class adviser."
      >
        <form onSubmit={handleCreateClass} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <Select
            label="Grade Level"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            options={[
              { value: '7', label: 'Grade 7 (Junior High)' },
              { value: '8', label: 'Grade 8 (Junior High)' },
              { value: '9', label: 'Grade 9 (Junior High)' },
              { value: '10', label: 'Grade 10 (Junior High)' },
              { value: '11', label: 'Grade 11 (Senior High)' },
              { value: '12', label: 'Grade 12 (Senior High)' },
            ]}
          />

          <Input
            label="Section Name"
            placeholder="e.g. SSC, Rizal, Emerald, STEM A"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            required
          />

          <Input
            label="Room Number (Optional)"
            placeholder="e.g. Building 2 - Room 304"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={creating}>
              Create Section
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manage Subject Teachers Modal */}
      {selectedClassForSubjects && (
        <Modal
          isOpen={Boolean(selectedClassForSubjects)}
          onClose={() => setSelectedClassForSubjects(null)}
          title={`Subject Teachers • ${formatGradeSection(selectedClassForSubjects.grade_level, selectedClassForSubjects.section_name)}`}
          description="Assign subject teachers and class schedules for this section."
        >
          <div className="space-y-5">
            {/* List of current subject assignments */}
            <div>
              <h4 className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
                Assigned Subjects ({selectedClassForSubjects.subject_teachers?.length || 0})
              </h4>
              {!selectedClassForSubjects.subject_teachers ||
              selectedClassForSubjects.subject_teachers.length === 0 ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-400 italic">
                  No subject teachers assigned yet. Assign Mathematics, Science, English, etc.
                  below.
                </p>
              ) : (
                <div className="max-h-48 divide-y divide-slate-100 overflow-hidden overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {selectedClassForSubjects.subject_teachers.map((st: SectionSubjectTeacher) => {
                    const assignedTeacherName =
                      teachersList.find((t) => t.id === st.teacher_id)?.full_name ||
                      (st.teacher_id === user?.id
                        ? `${profile?.full_name || 'You'}`
                        : 'Assigned Teacher');

                    return (
                      <div key={st.id} className="flex items-center justify-between p-2.5 text-xs">
                        <div>
                          <p className="font-bold text-slate-900">{st.subject_name}</p>
                          <p className="text-[11px] text-slate-500">
                            Teacher: {assignedTeacherName}{' '}
                            {st.schedule_time ? `• ${st.schedule_time}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(st.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Remove Assignment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Form to assign a subject teacher */}
            <form
              onSubmit={handleAssignSubjectTeacher}
              className="space-y-3 border-t border-slate-100 pt-3"
            >
              <h4 className="text-xs font-bold tracking-wider text-slate-700 uppercase">
                + Assign Subject Teacher
              </h4>

              {subjectError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                  {subjectError}
                </div>
              )}

              <Select
                label="Subject"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                options={[
                  ...HIGH_SCHOOL_SUBJECTS.map((s) => ({ value: s, label: s })),
                  { value: 'Custom', label: 'Other / Custom Subject' },
                ]}
              />

              {newSubjectName === 'Custom' && (
                <Input
                  label="Custom Subject Name"
                  placeholder="e.g. Journalism, Robotics"
                  value={customSubjectName}
                  onChange={(e) => setCustomSubjectName(e.target.value)}
                  required
                />
              )}

              <Select
                label="Assign To Teacher"
                value={assignedTeacherId}
                onChange={(e) => setAssignedTeacherId(e.target.value)}
                options={[
                  {
                    value: user?.id || '',
                    label: `Myself (${profile?.full_name || 'Logged in'})`,
                  },
                  ...teachersList
                    .filter((t) => t.id !== user?.id)
                    .map((t) => ({ value: t.id, label: t.full_name })),
                ]}
              />

              <Input
                label="Schedule / Period (Optional)"
                placeholder="e.g. 7:30 AM - 8:30 AM (M-F)"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedClassForSubjects(null)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={assigningSubject}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Assign Subject
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
};
