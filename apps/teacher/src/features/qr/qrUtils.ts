import { createQrPayload, parseQrPayload } from '@qr-attendance/validation';
import type { StudentWithSection } from '@qr-attendance/types';

export function getStudentQrPayload(qrIdentifier: string): string {
  return createQrPayload(qrIdentifier);
}

export function validateScannedQr(rawPayload: string) {
  return parseQrPayload(rawPayload);
}

export function downloadQrCode(canvasElementId: string, filename: string) {
  const canvas = document.getElementById(canvasElementId) as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas element not found for QR download:', canvasElementId);
    return;
  }

  const pngUrl = canvas.toDataURL('image/png');
  const downloadLink = document.createElement('a');
  downloadLink.href = pngUrl;
  downloadLink.download = `${filename}.png`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

export function printStudentQrCard(student: StudentWithSection) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const payload = getStudentQrPayload(student.qr_identifier);
  const fullName = `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.suffix || ''}`.trim();

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print QR — ${fullName}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; padding: 20px; }
          .card { border: 2px solid #1e3a8a; border-radius: 12px; width: 300px; padding: 20px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { font-size: 14px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; margin-bottom: 4px; }
          .sub { font-size: 11px; color: #64748b; margin-bottom: 16px; }
          .qr-box { margin: 0 auto 16px auto; width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; }
          .name { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
          .lrn { font-family: monospace; font-size: 13px; color: #334155; margin-bottom: 6px; }
          .section { font-size: 12px; font-weight: 600; color: #2563eb; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      </head>
      <body>
        <div class="card">
          <div class="header">Department of Education</div>
          <div class="sub">Student Attendance Pass</div>
          <canvas id="print-qr" class="qr-box"></canvas>
          <div class="name">${fullName}</div>
          <div class="lrn">LRN: ${student.lrn}</div>
          <div class="section">Grade ${student.grade_level} — ${student.section_name || 'Class Section'}</div>
        </div>
        <script>
          QRCode.toCanvas(document.getElementById('print-qr'), '${payload}', { width: 180, margin: 1 }, function() {
            setTimeout(function() { window.print(); window.close(); }, 400);
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function printBatchStudentQrCards(students: StudentWithSection[]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const cardsHtml = students
    .map((s, idx) => {
      const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ''} ${s.suffix || ''}`.trim();
      const payload = getStudentQrPayload(s.qr_identifier);
      return `
        <div class="card">
          <div class="header">Department of Education</div>
          <div class="sub">Student Attendance Pass</div>
          <canvas id="qr-${idx}" class="qr-box"></canvas>
          <div class="name">${fullName}</div>
          <div class="lrn">LRN: ${s.lrn}</div>
          <div class="section">Grade ${s.grade_level} — ${s.section_name || 'Section'}</div>
          <script>
            QRCode.toCanvas(document.getElementById('qr-${idx}'), '${payload}', { width: 140, margin: 1 });
          </script>
        </div>
      `;
    })
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Batch Print QR Cards</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 10px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
          .card { border: 1.5px solid #1e3a8a; border-radius: 10px; padding: 12px; text-align: center; page-break-inside: avoid; }
          .header { font-size: 12px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; }
          .sub { font-size: 10px; color: #64748b; margin-bottom: 8px; }
          .qr-box { margin: 0 auto 8px auto; width: 140px; height: 140px; }
          .name { font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 2px; }
          .lrn { font-family: monospace; font-size: 11px; color: #334155; margin-bottom: 4px; }
          .section { font-size: 11px; font-weight: 600; color: #2563eb; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      </head>
      <body>
        <div class="grid">
          ${cardsHtml}
        </div>
        <script>
          setTimeout(function() { window.print(); window.close(); }, 800);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
