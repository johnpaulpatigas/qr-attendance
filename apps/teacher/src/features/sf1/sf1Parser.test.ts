import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSF1Spreadsheet } from './sf1Parser';

describe('SF1 Spreadsheet Parser', () => {
  it('parses valid spreadsheet with standard DepEd columns and rows', async () => {
    const data = [
      ['Republic of the Philippines'],
      ['Department of Education'],
      ['School Form 1 (SF1) School Register'],
      [],
      ['LRN', 'Learner Name', 'Sex', 'Birth Date', 'Grade Level', 'Section', 'School Year'],
      [
        '108234981234',
        'Dela Cruz, Juan Mercado',
        'Male',
        '2008-05-14',
        '12',
        'STEM A',
        '2026-2027',
      ],
      ['108234981235', 'Santos, Maria Clara', 'Female', '2008-09-22', '12', 'STEM A', '2026-2027'],
      ['TOTAL MALE: 1', 'TOTAL FEMALE: 1', 'TOTAL: 2'],
      ['Prepared by: Adviser Name'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SF1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'sf1_sample.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseSF1Spreadsheet(file);
    expect(parsed.records.length).toBe(2);

    const first = parsed.records[0];
    expect(first.lrn).toBe('108234981234');
    expect(first.last_name).toBe('Dela Cruz');
    expect(first.first_name).toBe('Juan');
    expect(first.middle_name).toBe('Mercado');
    expect(first.sex).toBe('Male');
    expect(first.birth_date).toBe('2008-05-14');

    const second = parsed.records[1];
    expect(second.lrn).toBe('108234981235');
    expect(second.last_name).toBe('Santos');
    expect(second.first_name).toBe('Maria');
    expect(second.middle_name).toBe('Clara');
  });

  it('correctly handles separate Last Name and First Name columns', async () => {
    const data = [
      ['LRN', 'Surname', 'Given Name', 'Middle Name', 'Sex', 'Date of Birth', 'Grade', 'Section'],
      ['108234981236', 'Rizal', 'Jose', 'Protacio', 'M', '2008-06-19', '10', 'Section 1'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SF1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'sf1_separate_names.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseSF1Spreadsheet(file);
    expect(parsed.records.length).toBe(1);
    expect(parsed.records[0].last_name).toBe('Rizal');
    expect(parsed.records[0].first_name).toBe('Jose');
    expect(parsed.records[0].middle_name).toBe('Protacio');
  });
});
