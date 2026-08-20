import React, { useState } from 'react';
import { Modal, Button, Input, Select } from '@qr-attendance/ui';
import { createStudentSchema } from '@qr-attendance/validation';
import type { StudentWithSection } from '@qr-attendance/types';
import { createStudent } from './studentService';

export interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentCreated: (newStudent: StudentWithSection) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onStudentCreated,
}) => {
  const [lrn, setLrn] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [sex, setSex] = useState<'MALE' | 'FEMALE'>('MALE');
  const [birthDate, setBirthDate] = useState('2008-01-01');
  const [gradeLevel, setGradeLevel] = useState('12');
  const [sectionId, setSectionId] = useState('sec-1');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const inputData = {
      lrn,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName ? middleName : null,
      suffix: suffix ? suffix : null,
      sex,
      birth_date: birthDate,
      grade_level: Number(gradeLevel),
      section_id: 'e0123456-789a-bcde-f012-3456789abc01', // Standard section UUID
      school_year_id: 'e0123456-789a-bcde-f012-3456789abc02', // Standard SY UUID
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
        section_name: sectionId === 'sec-1' ? 'STEM A' : 'ABM B',
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    } finally {
      setIsLoading(false);
    }
  };

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
            helperText="DepEd 12-digit student identifier"
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
            onChange={(e) => setGradeLevel(e.target.value)}
            options={[
              { value: '12', label: 'Grade 12' },
              { value: '11', label: 'Grade 11' },
              { value: '10', label: 'Grade 10' },
              { value: '9', label: 'Grade 9' },
            ]}
          />
          <Select
            label="Class Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[
              { value: 'sec-1', label: 'STEM A' },
              { value: 'sec-2', label: 'ABM B' },
            ]}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Generate QR & Save
          </Button>
        </div>
      </form>
    </Modal>
  );
};
