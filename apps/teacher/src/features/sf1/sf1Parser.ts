import * as XLSX from 'xlsx';
import { parseFlexibleDate } from '@qr-attendance/validation';

export interface RawSF1Record {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  suffix?: string | null;
  sex: string;
  birth_date: string;
  grade_level: number;
  section_name: string;
  school_year: string;
  originalRowIndex: number;
}

export interface ParseSF1Result {
  records: RawSF1Record[];
  sheetName: string;
  totalParsed: number;
  detectedHeaders: Record<string, string>;
}

// Normalized matching helper
function findHeaderMatch(headers: string[], patterns: string[]): string | undefined {
  return headers.find((h) => {
    const clean = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    return patterns.some((p) => clean.includes(p.toLowerCase().replace(/[^a-z0-9]/g, '')));
  });
}

export async function parseSF1Spreadsheet(file: File): Promise<ParseSF1Result> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
  });

  if (rawRows.length === 0) {
    throw new Error('The uploaded spreadsheet is empty.');
  }

  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r] || [];
    const rowStr = row
      .map((cell) => String(cell ?? ''))
      .join(' ')
      .toUpperCase();
    if (
      rowStr.includes('LRN') ||
      rowStr.includes('LEARNER') ||
      (rowStr.includes('NAME') && rowStr.includes('SEX'))
    ) {
      headerRowIndex = r;
      headers = row.map((cell) => String(cell ?? '').trim());
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    headers = (rawRows[0] || []).map((cell) => String(cell ?? '').trim());
  }

  const colLrn = findHeaderMatch(headers, [
    'lrn',
    'learner reference',
    'reference number',
    'learner no',
  ]);
  const colLastName = findHeaderMatch(headers, ['last name', 'surname', 'family name', 'apelyido']);
  const colFirstName = findHeaderMatch(headers, ['first name', 'given name', 'pangalan']);
  const colMiddleName = findHeaderMatch(headers, ['middle name', 'middle']);
  const colSuffix = findHeaderMatch(headers, ['suffix', 'extension', 'ext']);
  const colFullName = findHeaderMatch(headers, [
    'name',
    'learner name',
    'student name',
    'full name',
  ]);
  const colSex = findHeaderMatch(headers, ['sex', 'gender', 'kasarian']);
  const colBirthDate = findHeaderMatch(headers, ['birth', 'dob', 'date of birth', 'kapanganakan']);
  const colGrade = findHeaderMatch(headers, ['grade', 'grade level', 'year level']);
  const colSection = findHeaderMatch(headers, ['section', 'class section', 'pangkat']);
  const colSchoolYear = findHeaderMatch(headers, ['school year', 'sy', 'taong panuruan']);

  const records: RawSF1Record[] = [];

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const rowArray = rawRows[i] || [];
    if (!rowArray || rowArray.length === 0) continue;

    const rowObj: Record<string, unknown> = {};
    headers.forEach((h, colIdx) => {
      if (h) {
        rowObj[h] = rowArray[colIdx];
      }
    });

    let lrnValue = String(colLrn ? (rowObj[colLrn] ?? '') : (rowArray[0] ?? '')).trim();
    // Clean non-numeric characters from LRN
    lrnValue = lrnValue.replace(/\D/g, '');

    // Skip empty rows, header repeats, or footer summary notes in DepEd SF1
    const rowText = rowArray
      .map((c) => String(c ?? ''))
      .join(' ')
      .toUpperCase();
    if (
      !lrnValue ||
      lrnValue.length < 6 ||
      rowText.includes('TOTAL MALE') ||
      rowText.includes('TOTAL FEMALE') ||
      rowText.includes('PREPARED BY:') ||
      rowText.includes('CERTIFIED CORRECT:')
    ) {
      continue;
    }

    let lastName = '';
    let firstName = '';
    let middleName: string | null = null;
    let suffix: string | null = null;

    if (colLastName && rowObj[colLastName]) {
      lastName = String(rowObj[colLastName]).trim();
      firstName = colFirstName ? String(rowObj[colFirstName] || '').trim() : '';
      middleName = colMiddleName ? String(rowObj[colMiddleName] || '').trim() : null;
      suffix = colSuffix ? String(rowObj[colSuffix] || '').trim() : null;
    } else if (colFullName && rowObj[colFullName]) {
      // Parse "LASTNAME, FIRSTNAME MIDDLENAME SUFFIX" format commonly used in DepEd forms
      const rawName = String(rowObj[colFullName]).trim();
      if (rawName.includes(',')) {
        const parts = rawName.split(',');
        lastName = parts[0].trim();
        const remainder = (parts[1] || '').trim().split(/\s+/);
        firstName = remainder[0] || '';
        middleName = remainder.slice(1).join(' ') || null;
      } else {
        const parts = rawName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || firstName;
      }
    }

    // Extract Sex
    const sexRaw = String(colSex ? rowObj[colSex] || '' : '').trim();

    // Extract Birth Date using flexible date parser
    let birthDate = '';
    if (colBirthDate && rowObj[colBirthDate] !== undefined && rowObj[colBirthDate] !== null) {
      const rawDateVal = rowObj[colBirthDate];
      const parsedRes = parseFlexibleDate(rawDateVal);
      birthDate = parsedRes.dateString || String(rawDateVal).trim();
    }

    // Extract Grade Level & Section
    const gradeRaw = colGrade ? rowObj[colGrade] : null;
    const gradeVal =
      gradeRaw !== null && gradeRaw !== undefined && gradeRaw !== '' ? Number(gradeRaw) : 0;
    const sectionVal = String(colSection ? rowObj[colSection] || '' : '').trim();
    const syVal = String(colSchoolYear ? rowObj[colSchoolYear] || '2026-2027' : '2026-2027').trim();

    records.push({
      lrn: lrnValue,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName,
      suffix: suffix,
      sex: sexRaw,
      birth_date: birthDate,
      grade_level: gradeVal,
      section_name: sectionVal,
      school_year: syVal,
      originalRowIndex: i + 1,
    });
  }

  return {
    records,
    sheetName: firstSheetName,
    totalParsed: records.length,
    detectedHeaders: {
      lrn: colLrn || 'Auto-Detected',
      name:
        colFullName ||
        (colLastName && colFirstName ? `${colLastName}, ${colFirstName}` : 'Auto-Detected'),
      sex: colSex || 'Auto-Detected',
      birthDate: colBirthDate || 'Auto-Detected',
      section: colSection || 'Auto-Detected',
    },
  };
}
