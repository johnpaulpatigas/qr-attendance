import * as XLSX from 'xlsx';
import type { SF2ReportData } from './reportService';

export function exportSF2ToExcel(report: SF2ReportData) {
  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [];

  rows.push(['School Form 2 (SF2) Daily Attendance Report of Learners']);
  rows.push([`School Name: ${report.schoolName}`, '', `School ID: ${report.schoolId}`, '', `District: ${report.district}`]);
  rows.push([`Division: ${report.division}`, '', `Region: ${report.region}`, '', `School Year: ${report.schoolYear}`]);
  rows.push([`Grade Level: ${report.gradeLevel}`, '', `Section: ${report.sectionName}`, '', `Month: ${report.monthName} ${report.year}`]);
  rows.push([]); // blank

  // Table Headers
  const tableHeader = ['No.', 'LRN', "LEARNER'S NAME (Last Name, First Name, Middle Name)"];
  report.schoolDays.forEach((d) => tableHeader.push(String(d)));
  tableHeader.push('TOTAL ABSENT', 'TOTAL TARDY', 'REMARKS');
  rows.push(tableHeader);

  // Male Section
  rows.push(['MALE']);
  report.maleStudents.forEach((r, idx) => {
    const fullName = `${r.student.last_name}, ${r.student.first_name} ${r.student.middle_name || ''} ${r.student.suffix || ''}`.trim();
    const row = [idx + 1, r.student.lrn, fullName];
    report.schoolDays.forEach((d) => {
      const st = r.dailyStatus[d];
      row.push(st === 'present' ? '/' : st === 'late' ? 'T' : st === 'absent' ? 'X' : '');
    });
    row.push(r.totalAbsences, r.totalTardy, '');
    rows.push(row);
  });
  rows.push(['', '', 'TOTAL MALE', ...report.schoolDays.map(() => ''), report.maleTotalAbsent, report.maleTotalTardy, '']);

  // Female Section
  rows.push(['FEMALE']);
  report.femaleStudents.forEach((r, idx) => {
    const fullName = `${r.student.last_name}, ${r.student.first_name} ${r.student.middle_name || ''} ${r.student.suffix || ''}`.trim();
    const row = [idx + 1, r.student.lrn, fullName];
    report.schoolDays.forEach((d) => {
      const st = r.dailyStatus[d];
      row.push(st === 'present' ? '/' : st === 'late' ? 'T' : st === 'absent' ? 'X' : '');
    });
    row.push(r.totalAbsences, r.totalTardy, '');
    rows.push(row);
  });
  rows.push(['', '', 'TOTAL FEMALE', ...report.schoolDays.map(() => ''), report.femaleTotalAbsent, report.femaleTotalTardy, '']);

  // Summary
  rows.push([]);
  rows.push(['SUMMARY FOR THE MONTH:']);
  rows.push(['Total Enrollment:', report.totalEnrollment]);
  rows.push(['Average Daily Attendance (ADA):', report.averageDailyAttendance]);
  rows.push(['Attendance Percentage:', `${report.attendancePercentage}%`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `SF2_${report.monthName.slice(0, 3)}`);

  const filename = `SF2_${report.sectionName}_${report.monthName}_${report.year}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function printSF2Document(report: SF2ReportData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const renderStudentRows = (list: typeof report.maleStudents, startIndex: number) => {
    return list
      .map((r, idx) => {
        const fullName = `${r.student.last_name}, ${r.student.first_name} ${r.student.middle_name || ''} ${r.student.suffix || ''}`.trim();
        const daysCells = report.schoolDays
          .map((d) => {
            const st = r.dailyStatus[d];
            const text = st === 'present' ? '/' : st === 'late' ? 'T' : st === 'absent' ? 'X' : '';
            const color = st === 'absent' ? 'color: red;' : st === 'late' ? 'color: orange;' : '';
            return `<td style="text-align: center; ${color}">${text}</td>`;
          })
          .join('');

        return `
          <tr>
            <td style="text-align: center;">${startIndex + idx + 1}</td>
            <td style="font-family: monospace;">${r.student.lrn}</td>
            <td>${fullName}</td>
            ${daysCells}
            <td style="text-align: center; font-weight: bold;">${r.totalAbsences}</td>
            <td style="text-align: center; font-weight: bold;">${r.totalTardy}</td>
          </tr>
        `;
      })
      .join('');
  };

  const daysHeaders = report.schoolDays
    .map((d) => `<th style="width: 20px; font-size: 9px;">${d}</th>`)
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>DepEd SF2 — ${report.sectionName} — ${report.monthName} ${report.year}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #0f172a; }
          .header { text-align: center; margin-bottom: 12px; }
          .header h2 { margin: 0 0 2px 0; font-size: 14px; text-transform: uppercase; }
          .header h3 { margin: 0 0 8px 0; font-size: 12px; color: #475569; }
          .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; font-size: 10px; border: 1px solid #cbd5e1; padding: 6px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
          th, td { border: 1px solid #94a3b8; padding: 3px 4px; }
          th { background: #f1f5f9; text-align: left; }
          .section-divider { background: #e2e8f0; font-weight: bold; }
          .summary-box { display: flex; justify-content: space-between; border: 1px solid #94a3b8; padding: 8px 12px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Department of Education</h2>
          <h3>School Form 2 (SF2) Daily Attendance Report of Learners</h3>
        </div>

        <div class="meta-grid">
          <div><strong>School:</strong> ${report.schoolName}</div>
          <div><strong>School ID:</strong> ${report.schoolId}</div>
          <div><strong>District:</strong> ${report.district}</div>
          <div><strong>Division:</strong> ${report.division}</div>
          <div><strong>Grade & Section:</strong> Grade ${report.gradeLevel} — ${report.sectionName}</div>
          <div><strong>School Year:</strong> ${report.schoolYear}</div>
          <div><strong>Month:</strong> ${report.monthName} ${report.year}</div>
          <div><strong>Total Days:</strong> ${report.schoolDays.length}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 25px;">No.</th>
              <th style="width: 85px;">LRN</th>
              <th>Learner's Name</th>
              ${daysHeaders}
              <th style="width: 35px; text-align: center;">ABS</th>
              <th style="width: 35px; text-align: center;">TAR</th>
            </tr>
          </thead>
          <tbody>
            <tr class="section-divider">
              <td colspan="${3 + report.schoolDays.length + 2}">MALE (${report.maleStudents.length})</td>
            </tr>
            ${renderStudentRows(report.maleStudents, 0)}
            
            <tr class="section-divider">
              <td colspan="${3 + report.schoolDays.length + 2}">FEMALE (${report.femaleStudents.length})</td>
            </tr>
            ${renderStudentRows(report.femaleStudents, 0)}
          </tbody>
        </table>

        <div class="summary-box">
          <div><strong>Total Enrollment:</strong> ${report.totalEnrollment}</div>
          <div><strong>Average Daily Attendance (ADA):</strong> ${report.averageDailyAttendance}</div>
          <div><strong>Attendance Percentage:</strong> ${report.attendancePercentage}%</div>
          <div><strong>Generated via:</strong> QR-Based School Attendance System</div>
        </div>

        <script>
          setTimeout(function() { window.print(); window.close(); }, 500);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
