import { describe, it, expect } from 'vitest';
import { validateSF1Records } from './sf1Validator';
import type { RawSF1Record } from './sf1Parser';

describe('SF1 Validator Service', () => {
  it('validates a clean batch of raw SF1 records', async () => {
    const rawRecords: RawSF1Record[] = [
      {
        lrn: '108234981234',
        last_name: 'Dela Cruz',
        first_name: 'Juan',
        middle_name: 'Mercado',
        suffix: null,
        sex: 'MALE',
        birth_date: '2008-05-14',
        grade_level: 12,
        section_name: 'STEM A',
        school_year: '2026-2027',
        originalRowIndex: 2,
      },
      {
        lrn: '108234981235',
        last_name: 'Santos',
        first_name: 'Maria',
        middle_name: 'Clara',
        suffix: null,
        sex: 'FEMALE',
        birth_date: '2008-09-22',
        grade_level: 12,
        section_name: 'STEM A',
        school_year: '2026-2027',
        originalRowIndex: 3,
      },
    ];

    const summary = await validateSF1Records(rawRecords);
    expect(summary.totalRows).toBe(2);
    expect(summary.validRows).toBe(2);
    expect(summary.invalidRows).toBe(0);
    expect(summary.duplicateCount).toBe(0);
  });

  it('detects and flags duplicate LRNs within the same spreadsheet', async () => {
    const rawRecords: RawSF1Record[] = [
      {
        lrn: '108234981234',
        last_name: 'Dela Cruz',
        first_name: 'Juan',
        middle_name: null,
        suffix: null,
        sex: 'MALE',
        birth_date: '2008-05-14',
        grade_level: 12,
        section_name: 'STEM A',
        school_year: '2026-2027',
        originalRowIndex: 2,
      },
      {
        lrn: '108234981234', // DUPLICATE LRN
        last_name: 'Dela Cruz',
        first_name: 'Juanito',
        middle_name: null,
        suffix: null,
        sex: 'MALE',
        birth_date: '2008-05-14',
        grade_level: 12,
        section_name: 'STEM A',
        school_year: '2026-2027',
        originalRowIndex: 3,
      },
    ];

    const summary = await validateSF1Records(rawRecords);
    expect(summary.totalRows).toBe(2);
    expect(summary.validRows).toBe(1);
    expect(summary.invalidRows).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.records[1].isDuplicateInFile).toBe(true);
    expect(summary.records[1].errors.some((e) => e.includes('Duplicate LRN'))).toBe(true);
  });

  it('flags rows with missing required fields or invalid LRNs', async () => {
    const rawRecords: RawSF1Record[] = [
      {
        lrn: '123', // Invalid short LRN
        last_name: '', // Missing last name
        first_name: 'Pedro',
        middle_name: null,
        suffix: null,
        sex: 'MALE',
        birth_date: 'invalid-date',
        grade_level: 0,
        section_name: '',
        school_year: '2026-2027',
        originalRowIndex: 2,
      },
    ];

    const summary = await validateSF1Records(rawRecords);
    expect(summary.validRows).toBe(0);
    expect(summary.invalidRows).toBe(1);
    expect(summary.records[0].isValid).toBe(false);
    expect(summary.records[0].errors.length).toBeGreaterThan(0);
  });
});
