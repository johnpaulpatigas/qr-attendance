import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select } from '@qr-attendance/ui';
import { createStudentSchema, formatGradeSection } from '@qr-attendance/validation';
import type { StudentWithSection, ClassSectionWithDetails } from '@qr-attendance/types';
import { getSupabaseClient } from '@qr-attendance/supabase';
import { createStudent } from './studentService';
import { fetchClassSections } from '../attendance/attendanceSessionService';

export interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentCreated: (newStudent: StudentWithSection) => void;
  initialGradeLevel?: string;
  initialSectionId?: string;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onStudentCreated,
  initialGradeLevel,
  initialSectionId,
}) => {
  const [sections, setSections] = useState<ClassSectionWithDetails[]>([]);
  const [lrn, setLrn] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [sex, setSex] = useState<'MALE' | 'FEMALE'>('MALE');
  const [birthDate, setBirthDate] = useState('2008-01-01');
  const [gradeLevel, setGradeLevel] = useState(initialGradeLevel || '10');
  const [sectionId, setSectionId] = useState(initialSectionId || '');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchClassSections().then((secs) => {
        setSections(secs);

        let targetGrade = initialGradeLevel || '10';
        let targetSecId = initialSectionId || '';

        if (targetSecId) {
          const found = secs.find((s) => s.id === targetSecId);
          if (found) {
            targetGrade = String(found.grade_level);
          } else {
            targetSecId = '';
          }
        }

        if (!targetSecId) {
          const matching = secs.filter((s) => String(s.grade_level) === targetGrade);
          if (matching.length > 0) {
            targetSecId = matching[0].id;
          } else if (secs.length > 0) {
            targetGrade = String(secs[0].grade_level);
            targetSecId = secs[0].id;
          }
        }

        setGradeLevel(targetGrade);
        setSectionId(targetSecId);
      });
    }
  }, [isOpen, initialGradeLevel, initialSectionId]);

  const handleGradeChange = (newGrade: string) => {
    setGradeLevel(newGrade);
    const matching = sections.filter((s) => String(s.grade_level) === newGrade);
    if (matching.length > 0) {
      if (!matching.some((s) => s.id === sectionId)) {
        setSectionId(matching[0].id);
      }
    } else {
      setSectionId('');
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const client = getSupabaseClient();

    if (!sectionId) {
      setError('Please select or create a class section first.');
      return;
    }

    let syId = '';
    const selectedSec = sections.find((s) => s.id === sectionId);
    if (selectedSec?.school_year_id) {
      syId = selectedSec.school_year_id;
    } else {
      const { data: sy } = await client.from('school_years').select('id').limit(1).maybeSingle();
      syId = sy?.id || crypto.randomUUID();
    }

    const inputData = {
      lrn,
      last_name: lastName.trim(),
      first_name: firstName.trim(),
      middle_name: middleName.trim() ? middleName.trim() : null,
      suffix: suffix.trim() ? suffix.trim() : null,
      sex,
      birth_date: birthDate,
      grade_level: Number(gradeLevel),
      section_id: sectionId,
      school_year_id: syId,
    };

    const validation = createStudentSchema.safeParse(inputData);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const created = await createStudent(validation.data);
      onStudentCreated({
        ...created,
        section_name: selectedSec?.section_name || 'Section',
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    } finally {
      setIsLoading(false);
    }
  };

  const availableSections = sections.filter((s) => String(s.grade_level) === gradeLevel);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Student"
      description="Register student in class section and generate unique QR identifier"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Learner Reference No. (LRN)"
            placeholder="12 numeric digits"
            value={lrn}
            onChange={(e) => setLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
            helperText="MNHS 12-digit student identifier (LRN)"
            required
          />
          <Select
            label="Sex"
            value={sex}
            onChange={(e) => setSex(e.target.value as 'MALE' | 'FEMALE')}
            options={[
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Last Name"
            placeholder="e.g. Dela Cruz"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <Input
            label="First Name"
            placeholder="e.g. Juan"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Middle Name"
            placeholder="Optional"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
          />
          <Input
            label="Suffix"
            placeholder="Jr., III, etc."
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
          />
          <Input
            label="Birth Date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Grade Level"
            value={gradeLevel}
            onChange={(e) => handleGradeChange(e.target.value)}
            options={[
              { value: '7', label: 'Grade 7' },
              { value: '8', label: 'Grade 8' },
              { value: '9', label: 'Grade 9' },
              { value: '10', label: 'Grade 10' },
              { value: '11', label: 'Grade 11' },
              { value: '12', label: 'Grade 12' },
            ]}
          />
          <Select
            label="Class Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={
              availableSections.length > 0
                ? availableSections.map((s) => ({
                    value: s.id,
                    label: formatGradeSection(s.grade_level, s.section_name),
                  }))
                : [{ value: '', label: `No Grade ${gradeLevel} sections available` }]
            }
            helperText={availableSections.length === 0 ? `No sections registered for Grade ${gradeLevel} yet.` : undefined}
          />
        </div>


        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={sections.length === 0}>
            Generate QR & Save
          </Button>
        </div>
      </form>
    </Modal>
  );
};
