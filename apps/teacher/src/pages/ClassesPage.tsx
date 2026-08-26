import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, BookOpen, QrCode } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Modal,
  Input,
  Select,
  LoadingState,
  EmptyState,
} from '@qr-attendance/ui';
import { getSupabaseClient } from '@qr-attendance/supabase';
import { useAuth } from '../features/auth/AuthContext';

interface ClassSectionItem {
  id: string;
  grade_level: number;
  section_name: string;
  room_number: string | null;
  school_year_id: string;
  school_year_name?: string;
  student_count: number;
}

export const ClassesPage: React.FC = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassSectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState<string>('10');
  const [sectionName, setSectionName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  const loadClasses = async () => {
    setLoading(true);
    const client = getSupabaseClient();
    try {
      const { data, error } = await client
        .from('class_sections')
        .select(`
          *,
          school_years (
            name
          ),
          students (
            id
          )
        `)
        .order('grade_level', { ascending: true });

      if (error) {
        console.error('Error fetching classes:', error.message);
        setClasses([]);
      } else {
        interface ClassSectionJoinRow {
          id: string;
          grade_level: number;
          section_name: string;
          room_number: string | null;
          school_year_id: string;
          school_years?: { name?: string } | null;
          students?: { id: string }[] | null;
        }

        const mapped: ClassSectionItem[] = (data as unknown as ClassSectionJoinRow[] || []).map((d) => ({
          id: d.id,
          grade_level: d.grade_level,
          section_name: d.section_name,
          room_number: d.room_number,
          school_year_id: d.school_year_id,
          school_year_name: d.school_years?.name || 'Active Year',
          student_count: Array.isArray(d.students) ? d.students.length : 0,
        }));
        setClasses(mapped);
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

      const { error: insertErr } = await client.from('class_sections').insert({
        school_year_id: syId || '',
        grade_level: Number(gradeLevel),
        section_name: sectionName.trim(),
        room_number: roomNumber.trim() || null,
        teacher_id: user?.id || null,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Classes & Sections</h2>
          <p className="text-sm text-slate-500">
            Manage your advisory and subject classes for the school year.
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
        <LoadingState message="Loading class sections from database..." />
      ) : classes.length === 0 ? (
        <EmptyState
          title="No Class Sections Registered"
          description="Create your first class section to begin managing student enrollments and scanning attendance."
          action={{
            label: 'Create Class Section',
            onClick: () => setIsAddModalOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <Card key={cls.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Grade {cls.grade_level}
                  </span>
                  <BookOpen className="h-4 w-4 text-slate-400" />
                </div>
                <CardTitle className="text-lg">{cls.section_name}</CardTitle>
                {cls.room_number && (
                  <p className="text-xs text-slate-400 font-medium">Room {cls.room_number}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-slate-400" /> Students Enrolled
                  </span>
                  <span className="font-bold text-slate-900">{cls.student_count}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <Link to={`/students?section=${cls.id}`}>
                    <Button variant="outline" size="sm">
                      Roster
                    </Button>
                  </Link>
                  <Link to={`/attendance`}>
                    <Button variant="primary" size="sm" leftIcon={<QrCode className="h-3.5 w-3.5" />}>
                      Scan
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Class Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Class Section"
        description="Register a new grade level and section into the database."
      >
        <form onSubmit={handleCreateClass} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <Select
            label="Grade Level"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            options={[
              { value: '7', label: 'Grade 7' },
              { value: '8', label: 'Grade 8' },
              { value: '9', label: 'Grade 9' },
              { value: '10', label: 'Grade 10' },
              { value: '11', label: 'Grade 11' },
              { value: '12', label: 'Grade 12' },
            ]}
          />

          <Input
            label="Section Name"
            placeholder="e.g. Rizal, STEM A, Diamond"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            required
          />

          <Input
            label="Room Number (Optional)"
            placeholder="e.g. Room 204, Building B"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
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
    </div>
  );
};
