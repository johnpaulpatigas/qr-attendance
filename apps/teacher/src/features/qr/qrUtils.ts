import { createQrPayload, parseQrPayload, formatGradeSection } from '@qr-attendance/validation';
import type { StudentWithSection } from '@qr-attendance/types';

export function getStudentQrPayload(qrIdentifier: string): string {
  return createQrPayload(qrIdentifier);
}

export function validateScannedQr(rawPayload: string) {
  return parseQrPayload(rawPayload);
}

export async function generateQrDataUrl(payload: string, width = 200): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(payload, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
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

export async function printStudentQrCard(student: StudentWithSection) {
  const payload = getStudentQrPayload(student.qr_identifier);
  const fullName =
    `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.suffix || ''}`.trim();
  const qrDataUrl = await generateQrDataUrl(payload, 220);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups for this site to print ID passes.');
    return;
  }

  printWindow.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Print ID Pass — ${fullName}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 15mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 80vh;
        margin: 0;
        padding: 20px;
        background-color: #f8fafc;
      }
      .card {
        border: 2px solid #1e3a8a;
        border-radius: 16px;
        width: 320px;
        padding: 24px;
        text-align: center;
        background: #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .header {
        font-size: 13px;
        font-weight: 800;
        color: #1e3a8a;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 2px;
      }
      .sub {
        font-size: 11px;
        color: #64748b;
        margin-bottom: 16px;
      }
      .qr-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0 auto 16px auto;
        padding: 12px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        width: 204px;
        height: 204px;
      }
      .qr-image {
        width: 180px;
        height: 180px;
        display: block;
      }
      .name {
        font-size: 17px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 4px;
        line-height: 1.2;
      }
      .lrn {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        font-weight: 600;
        color: #334155;
        margin-bottom: 6px;
      }
      .section {
        font-size: 12px;
        font-weight: 600;
        color: #2563eb;
      }
      @media print {
        body {
          background-color: #ffffff;
          padding: 0;
        }
        .card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">Student Attendance Pass</div>
      <div class="sub">Official QR Identification</div>
      <div class="qr-container">

        <img src="${qrDataUrl}" alt="Student QR Code" class="qr-image" />
      </div>
      <div class="name">${fullName}</div>
      <div class="lrn">LRN: ${student.lrn}</div>
      <div class="section">${formatGradeSection(student.grade_level, student.section_name)}</div>
    </div>

    <script>
      function triggerPrint() {
        window.focus();
        window.print();
      }
      if (document.readyState === 'complete') {
        setTimeout(triggerPrint, 150);
      } else {
        window.addEventListener('load', function() {
          setTimeout(triggerPrint, 150);
        });
      }
    </script>
  </body>
</html>
  `);
  printWindow.document.close();
}

export async function printBatchStudentQrCards(students: StudentWithSection[]) {
  if (students.length === 0) return;

  const cardsWithQr = await Promise.all(
    students.map(async (student) => {
      const payload = getStudentQrPayload(student.qr_identifier);
      const qrDataUrl = await generateQrDataUrl(payload, 160);
      const fullName =
        `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.suffix || ''}`.trim();
      return { student, fullName, qrDataUrl };
    })
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups for this site to print ID passes.');
    return;
  }

  const cardsHtml = cardsWithQr
    .map(
      ({ student, fullName, qrDataUrl }) => `
        <div class="card">
          <div class="header">Student Attendance Pass</div>
          <div class="sub">Official QR Identification</div>
          <div class="qr-container">

            <img src="${qrDataUrl}" alt="Student QR Code" class="qr-image" />
          </div>
          <div class="name">${fullName}</div>
          <div class="lrn">LRN: ${student.lrn}</div>
          <div class="section">${formatGradeSection(student.grade_level, student.section_name)}</div>
        </div>

      `
    )
    .join('');

  printWindow.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Batch Print QR Cards (${students.length} Students)</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        margin: 0;
        padding: 10px;
        background-color: #ffffff;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
      .card {
        border: 1.5px solid #1e3a8a;
        border-radius: 12px;
        padding: 16px 12px;
        text-align: center;
        page-break-inside: avoid;
        background: #ffffff;
      }
      .header {
        font-size: 11px;
        font-weight: 800;
        color: #1e3a8a;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .sub {
        font-size: 10px;
        color: #64748b;
        margin-bottom: 8px;
      }
      .qr-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0 auto 8px auto;
        width: 140px;
        height: 140px;
      }
      .qr-image {
        width: 130px;
        height: 130px;
        display: block;
      }
      .name {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 2px;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lrn {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        font-weight: 600;
        color: #334155;
        margin-bottom: 3px;
      }
      .section {
        font-size: 10.5px;
        font-weight: 600;
        color: #2563eb;
      }
    </style>
  </head>
  <body>
    <div class="grid">
      ${cardsHtml}
    </div>
    <script>
      function triggerPrint() {
        window.focus();
        window.print();
      }
      if (document.readyState === 'complete') {
        setTimeout(triggerPrint, 150);
      } else {
        window.addEventListener('load', function() {
          setTimeout(triggerPrint, 150);
        });
      }
    </script>
  </body>
</html>
  `);
  printWindow.document.close();
}
