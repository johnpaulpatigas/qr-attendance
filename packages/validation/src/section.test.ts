import { describe, it, expect } from 'vitest';
import { cleanSectionName, formatGradeSection, extractGradeFromSection } from './section';

describe('Section Name Formatting & De-duplication', () => {
  it('strips leading grade number prefixes from section names', () => {
    expect(cleanSectionName('10-SSC')).toBe('SSC');
    expect(cleanSectionName('10 - SSC')).toBe('SSC');
    expect(cleanSectionName('10—SSC')).toBe('SSC');
    expect(cleanSectionName('12-STEM A')).toBe('STEM A');
    expect(cleanSectionName('12 - STEM A')).toBe('STEM A');
    expect(cleanSectionName('Grade 10 - SSC')).toBe('SSC');
    expect(cleanSectionName('Grade 10-SSC')).toBe('SSC');
    expect(cleanSectionName('G10 - SSC')).toBe('SSC');
    expect(cleanSectionName('Gr. 10 - SSC')).toBe('SSC');
    expect(cleanSectionName('Rizal')).toBe('Rizal');
  });

  it('extracts embedded grade numbers from section names', () => {
    expect(extractGradeFromSection('10-SSC')).toBe(10);
    expect(extractGradeFromSection('12 - STEM A')).toBe(12);
    expect(extractGradeFromSection('Grade 8 - Sapphire')).toBe(8);
    expect(extractGradeFromSection('Rizal')).toBeNull();
  });

  it('formats grade and section cleanly without redundant grade text', () => {
    // Redundant "10-SSC" with grade 10
    expect(formatGradeSection(10, '10-SSC')).toBe('Grade 10 — SSC');
    expect(formatGradeSection(10, '10 - SSC')).toBe('Grade 10 — SSC');
    expect(formatGradeSection(10, 'Grade 10 - SSC')).toBe('Grade 10 — SSC');

    // Normal section name "Rizal" with grade 10
    expect(formatGradeSection(10, 'Rizal')).toBe('Grade 10 — Rizal');

    // Senior High section "12-STEM A" with grade 12
    expect(formatGradeSection(12, '12-STEM A')).toBe('Grade 12 — STEM A');
    expect(formatGradeSection(12, 'STEM A')).toBe('Grade 12 — STEM A');

    // Missing grade level but grade embedded in section name
    expect(formatGradeSection(null, '10-SSC')).toBe('Grade 10 — SSC');
    expect(formatGradeSection(null, 'Rizal')).toBe('Rizal');
  });
});
