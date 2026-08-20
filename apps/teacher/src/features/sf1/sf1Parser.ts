import * as XLSX from 'xlsx';

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

  // Convert worksheet to raw array of rows
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false });

  if (rawRows.length === 0) {
    throw new Error('The uploaded spreadsheet is empty.');
  }

  // Find the header row (typically row with "LRN" or "Learner")
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r] || [];
    const rowStr = row.map((cell) => String(cell || '')).join(' ').toUpperCase();
    if (rowStr.includes('LRN') || rowStr.includes('LEARNER') || (rowStr.includes('NAME') && rowStr.includes('SEX'))) {
      headerRowIndex = r;
      headers = row.map((cell) => String(cell || '').trim());
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Default to the very first non-empty row as headers
    headerRowIndex = 0;
    headers = (rawRows[0] || []).map((cell) => String(cell || '').trim());
  }

  // Detect column mapping
  const colLrn = findHeaderMatch(headers, ['lrn', 'learner reference', 'reference number', 'learner no']);
  const colLastName = findHeaderMatch(headers, ['last name', 'surname', 'family name', 'apelyido']);
  const colFirstName = findHeaderMatch(headers, ['first name', 'given name', 'pangalan']);
  const colMiddleName = findHeaderMatch(headers, ['middle name', 'middle']);
  const colSuffix = findHeaderMatch(headers, ['suffix', 'extension', 'ext']);
  const colFullName = findHeaderMatch(headers, ['name', 'learner name', 'student name', 'full name']);
  const colSex = findHeaderMatch(headers, ['sex', 'gender', 'kasarian']);
  const colBirthDate = findHeaderMatch(headers, ['birth', 'dob', 'date of birth', 'kapanganakan']);
  const colGrade = findHeaderMatch(headers, ['grade', 'grade level', 'year level']);
  const colSection = findHeaderMatch(headers, ['section', 'class section', 'pangkat']);
  const colSchoolYear = findHeaderMatch(headers, ['school year', 'sy', 'taong panuruan']);

  const records: RawSF1Record[] = [];

  // Parse data rows starting after headerRowIndex
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const rowArray = rawRows[i] || [];
    if (!rowArray || rowArray.length === 0) continue;

    // Create an object keyed by header names
    const rowObj: Record<string, any> = {};
    headers.forEach((h, colIdx) => {
      if (h) {
        rowObj[h] = rowArray[colIdx];
      }
    });

    // Extract LRN
    let lrnValue = String(colLrn ? rowObj[colLrn] || '' : rowArray[0] || '').trim();
    // Clean non-numeric characters from LRN
    lrnValue = lrnValue.replace(/\D/g, '');

    // Skip empty or non-data lines (e.g. summary/notes lines in DepEd SF1 footers)
    if (!lrnValue || lrnValue.length < 6) {
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
    const sexRaw = String(colSex ? rowObj[colSex] || '' : 'MALE').trim();

    // Extract Birth Date
    let birthDate = '2008-01-01';
    if (colBirthDate && rowObj[colBirthDate]) {
      const val = rowObj[colBirthDate];
      if (val instanceof Date) {
        birthDate = val.toISOString().slice(0, 10);
      } else {
        const parsed = Date.parse(String(val));
        if (!isNaN(parsed)) {
          birthDate = new Date(parsed).toISOString().slice(0, 10);
        } else {
          birthDate = String(val).trim();
        }
      }
    }

    // Extract Grade Level & Section
    const gradeVal = Number(colGrade ? rowObj[colGrade] : 12) || 12;
    const sectionVal = String(colSection ? rowObj[colSection] || 'STEM A' : 'STEM A').trim();
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
      name: colFullName || (colLastName && colFirstName ? `${colLastName}, ${colFirstName}` : 'Auto-Detected'),
      sex: colSex || 'Defaulted',
      birthDate: colBirthDate || 'Defaulted',
      section: colSection || 'Defaulted',
    },
  };
}
