import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { Modal, Button, Badge } from '@qr-attendance/ui';
import type { StudentWithSection } from '@qr-attendance/types';
import { getStudentQrPayload, downloadQrCode, printStudentQrCard } from './qrUtils';
import { regenerateStudentQrIdentifier } from '../students/studentService';

export interface StudentQrModalProps {
  student: StudentWithSection | null;
  isOpen: boolean;
  onClose: () => void;
  onStudentUpdated?: (updated: StudentWithSection) => void;
}

export const StudentQrModal: React.FC<StudentQrModalProps> = ({
  student,
  isOpen,
  onClose,
  onStudentUpdated,
}) => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  if (!student) return null;

  const fullName = `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.suffix || ''}`.trim();
  const payload = getStudentQrPayload(student.qr_identifier);
  const canvasId = `student-qr-canvas-${student.id}`;

  const handleDownload = () => {
    downloadQrCode(canvasId, `QR_${student.lrn}_${student.last_name}`);
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printStudentQrCard(student);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Are you sure you want to regenerate this student QR identifier? The old QR code will immediately stop working.')) {
      return;
    }
    setIsRegenerating(true);
    try {
      const newIdentifier = await regenerateStudentQrIdentifier(student.id);
      const updated = { ...student, qr_identifier: newIdentifier };
      if (onStudentUpdated) onStudentUpdated(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate QR');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Student Attendance QR Pass"
      description="DepEd standard QR attendance identifier for scanning"
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            isLoading={isRegenerating}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="text-amber-700 hover:bg-amber-50"
          >
            Regenerate QR
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Download PNG
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              isLoading={isPrinting}
              leftIcon={<Printer className="h-4 w-4" />}
            >
              Print ID Pass
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col items-center space-y-4 py-2 text-center">
        {/* Printable Card Frame */}
        <div className="w-full max-w-xs rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-blue-50/50 to-white p-6 shadow-md">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Department of Education
          </div>
          <p className="text-[11px] text-slate-500 mb-3">Attendance QR Identification</p>

          <div className="my-2 flex justify-center rounded-xl bg-white p-4 shadow-xs border border-slate-100">
            <QRCodeCanvas
              id={canvasId}
              value={payload}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>

          <div className="mt-3 space-y-1">
            <h4 className="text-base font-bold text-slate-900 leading-tight">{fullName}</h4>
            <p className="font-mono text-xs font-semibold text-slate-600">LRN: {student.lrn}</p>
            <p className="text-xs font-medium text-blue-600">
              Grade {student.grade_level} — {student.section_name || 'Assigned Section'}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-400">
          <p>
            Payload Format: <Badge variant="outline" size="sm" className="font-mono text-[10px]">{payload}</Badge>
          </p>
          <p className="text-[11px]">
            Security Note: QR contains only student UUID reference. Personal records remain protected by server-side RLS.
          </p>
        </div>
      </div>
    </Modal>
  );
};
