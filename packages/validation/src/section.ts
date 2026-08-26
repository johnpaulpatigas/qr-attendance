/**
 * Utility functions for cleaning and formatting DepEd class section names without redundancy.
 */

/**
 * Strips redundant grade prefixes (e.g. "10-SSC", "10 - SSC", "Grade 10 - SSC", "G10 - SSC")
 * from section names.
 */
export function cleanSectionName(sectionName?: string | null): string {
  if (!sectionName) return '';
  const trimmed = sectionName.trim();

  // Strip prefixes like "Grade 10 - ", "Grade 10-", "Grade 10 ", "Gr. 10 - ", "G10 - ", "10-", "10 - "
  const cleaned = trimmed.replace(/^(?:grade\s*\d+|gr\.\s*\d+|g\d+|\d+)\s*[-—–:]?\s*/i, '').trim();
  return cleaned || trimmed;
}

/**
 * Extracts grade level if embedded in the section name (e.g. "10-SSC" -> 10).
 */
export function extractGradeFromSection(sectionName?: string | null): number | null {
  if (!sectionName) return null;
  const match = sectionName.trim().match(/^(?:grade\s*|gr\.\s*|g)?(\d{1,2})\s*[-—–:]?/i);
  if (match && match[1]) {
    const num = Number(match[1]);
    if (num >= 1 && num <= 12) return num;
  }
  return null;
}

/**
 * Formats grade and section cleanly without redundant grade repetition.
 * Examples:
 * - formatGradeSection(10, '10-SSC') -> "Grade 10 — SSC"
 * - formatGradeSection(10, 'Grade 10 - SSC') -> "Grade 10 — SSC"
 * - formatGradeSection(12, '12-STEM A') -> "Grade 12 — STEM A"
 * - formatGradeSection(12, 'STEM A') -> "Grade 12 — STEM A"
 * - formatGradeSection(null, '10-SSC') -> "Grade 10 — SSC"
 * - formatGradeSection(null, 'Diamond') -> "Diamond"
 */
export function formatGradeSection(
  gradeLevel?: number | string | null,
  sectionName?: string | null
): string {
  const clean = cleanSectionName(sectionName);
  const grade = Number(gradeLevel) || extractGradeFromSection(sectionName);

  if (grade && clean) {
    return `Grade ${grade} — ${clean}`;
  }
  if (grade && !clean) {
    return `Grade ${grade}`;
  }
  return clean || sectionName || 'Unassigned Section';
}
