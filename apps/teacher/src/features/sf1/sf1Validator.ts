import { validateSf1Row } from '@qr-attendance/validation';
import type { SF1ParsedStudent } from '@qr-attendance/types';
import type { RawSF1Record } from './sf1Parser';
import { getSupabaseClient } from '@qr-attendance/supabase';

export interface SF1ValidatedRecord {
  rowIndex: number;
  raw: RawSF1Record;
  data: SF1ParsedStudent;
  isValid: boolean;
  isDuplicateInFile: boolean;
  isExistingInDb: boolean;
  errors: string[];
  warnings: string[];
}

export interface SF1ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateCount: number;
  existingInDbCount: number;
  records: SF1ValidatedRecord[];
}

export async function validateSF1Records(
  rawRecords: RawSF1Record[],
  schoolYearId?: string
): Promise<SF1ValidationSummary> {
  const seenLrnsInFile = new Map<string, number>(); // lrn -> first seen rowIndex
  const lrnList = rawRecords.map((r) => r.lrn).filter(Boolean);

  // Check existing database records
  const existingDbLrns = new Set<string>();
  if (lrnList.length > 0) {
    try {
      const client = getSupabaseClient();
      let query = client.from('students').select('lrn');
      if (schoolYearId) {
        query = query.eq('school_year_id', schoolYearId);
      }
      const { data } = await query;
      if (data && Array.isArray(data)) {
        data.forEach((d: { lrn?: string }) => {
          if (d.lrn) existingDbLrns.add(d.lrn);
        });
      }
    } catch (err) {
      console.warn('Could not check existing database LRNs (offline/local mode):', err);
    }
  }

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let existingCount = 0;

  const validatedRecords: SF1ValidatedRecord[] = rawRecords.map((record) => {
    const parsedData = validateSf1Row({
      lrn: record.lrn,
      last_name: record.last_name,
      first_name: record.first_name,
      middle_name: record.middle_name,
      suffix: record.suffix,
      sex: record.sex,
      birth_date: record.birth_date,
      grade_level: record.grade_level,
      section_name: record.section_name,
      school_year: record.school_year,
    });

    const rowErrors: string[] = [...parsedData.errors];
    const rowWarnings: string[] = [];
    let isDuplicateInFile = false;

    // Check duplicate in spreadsheet
    if (record.lrn) {
      if (seenLrnsInFile.has(record.lrn)) {
        isDuplicateInFile = true;
        duplicateCount++;
        const prevRow = seenLrnsInFile.get(record.lrn);
        rowErrors.push(`Duplicate LRN in spreadsheet (already found in Row ${prevRow})`);
      } else {
        seenLrnsInFile.set(record.lrn, record.originalRowIndex);
      }
    }

    // Check existing in database
    const isExistingInDb = existingDbLrns.has(record.lrn);
    if (isExistingInDb) {
      existingCount++;
      rowWarnings.push('Student LRN already registered in system. Existing record will be updated.');
    }

    const isValid = rowErrors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    return {
      rowIndex: record.originalRowIndex,
      raw: record,
      data: parsedData,
      isValid,
      isDuplicateInFile,
      isExistingInDb,
      errors: rowErrors,
      warnings: rowWarnings,
    };
  });

  return {
    totalRows: rawRecords.length,
    validRows: validCount,
    invalidRows: invalidCount,
    duplicateCount,
    existingInDbCount: existingCount,
    records: validatedRecords,
  };
}
