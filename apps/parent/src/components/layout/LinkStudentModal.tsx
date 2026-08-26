import React, { useState } from 'react';
import { Modal, Button, Input, Select } from '@qr-attendance/ui';
import { Hash, HeartHandshake } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export interface LinkStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LinkStudentModal: React.FC<LinkStudentModalProps> = ({ isOpen, onClose }) => {
  const { linkStudentByLrn } = useAuth();
  const [lrn, setLrn] = useState('');
  const [relationship, setRelationship] = useState('Mother');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanLrn = lrn.replace(/\D/g, '');
    if (cleanLrn.length !== 12) {
      setError('Please enter a valid 12-digit Learner Reference Number (LRN).');
      return;
    }

    setIsLoading(true);
    const res = await linkStudentByLrn(cleanLrn, relationship);
    setIsLoading(false);

    if (res.success) {
      setSuccess(res.message);
      setTimeout(() => {
        setLrn('');
        setSuccess(null);
        onClose();
      }, 1200);
    } else {
      setError(res.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link Another Student"
      description="Attach an enrolled child to your parent portal account using their 12-digit LRN"
      size="md"
    >
      <form onSubmit={handleLink} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
            {success}
          </div>
        )}

        <Input
          label="Learner Reference No. (LRN)"
          placeholder="12 numeric digits"
          value={lrn}
          onChange={(e) => setLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
          leftIcon={<Hash className="h-4 w-4" />}
          helperText="Found on the student's ID badge or Form 137 / 138"
          required
        />

        <Select
          label="Your Relationship to Student"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          options={[
            { value: 'Mother', label: 'Mother' },
            { value: 'Father', label: 'Father' },
            { value: 'Guardian', label: 'Guardian' },
            { value: 'Student (Self)', label: 'Student (Self)' },
          ]}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            isLoading={isLoading}
            leftIcon={<HeartHandshake className="h-4 w-4" />}
          >
            Link Student
          </Button>
        </div>
      </form>
    </Modal>
  );
};
