/**
 * Utility functions for UTC+8 (Asia/Manila) date and time calculations and flexible date parsing.
 */

/**
 * Returns the date in YYYY-MM-DD format in UTC+8 (Asia/Manila timezone).
 */
export function getUtc8DateString(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback using direct +8 hours offset
    const utc8 = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000);
    const y = utc8.getFullYear();
    const m = String(utc8.getMonth() + 1).padStart(2, '0');
    const d = String(utc8.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Returns the hour and minute in UTC+8 (Asia/Manila timezone).
 */
export function getUtc8Time(date: Date = new Date()): { hours: number; minutes: number; totalMinutes: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hours = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minutes = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return { hours, minutes, totalMinutes: hours * 60 + minutes };
  } catch {
    const utc8 = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000);
    const hours = utc8.getHours();
    const minutes = utc8.getMinutes();
    return { hours, minutes, totalMinutes: hours * 60 + minutes };
  }
}

export interface ParseDateResult {
  success: boolean;
  dateString?: string; // YYYY-MM-DD
  error?: string;
}

/**
 * Robust flexible date parser.
 * Handles:
 * - Excel numeric serial numbers (e.g. 39448 -> 2008-01-01)
 * - Date objects
 * - YYYY-MM-DD (ISO)
 * - MM/DD/YYYY, M/D/YYYY, DD/MM/YYYY
 * - Text dates like "January 15, 2008", "15 Jan 2008"
 */
export function parseFlexibleDate(val: unknown): ParseDateResult {
  if (val === null || val === undefined || val === '') {
    return { success: false, error: 'Date value is empty' };
  }

  // 1. If already a Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { success: false, error: 'Invalid Date object' };
    }
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return { success: true, dateString: `${y}-${m}-${d}` };
  }

  // 2. If Excel serial number (e.g., 20000 - 60000)
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{4,6}(\.\d+)?$/.test(val.trim()))) {
    const num = typeof val === 'number' ? val : Number(val);
    if (!isNaN(num) && num > 1000 && num < 100000) {
      // Excel 1900 date system
      const ms = Math.round((num - 25569) * 86400 * 1000);
      const excelDate = new Date(ms);
      if (!isNaN(excelDate.getTime())) {
        const y = excelDate.getUTCFullYear();
        const m = String(excelDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(excelDate.getUTCDate()).padStart(2, '0');
        return { success: true, dateString: `${y}-${m}-${d}` };
      }
    }
  }

  const str = String(val).trim();

  // 3. ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return {
        success: true,
        dateString: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }
  }

  // 4. Slash / Dash formats: MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);

    if (y >= 1900 && y <= 2100) {
      let month: number;
      let day: number;

      if (p1 > 12 && p2 <= 12) {
        // Definitely DD/MM/YYYY
        day = p1;
        month = p2;
      } else {
        // Standard DepEd / Philippine format is usually MM/DD/YYYY or DD/MM/YYYY
        // Default to MM/DD/YYYY unless month > 12
        month = p1;
        day = p2;
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return {
          success: true,
          dateString: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        };
      }
    }
  }

  // 5. JavaScript Date.parse fallback
  const parsedMs = Date.parse(str);
  if (!isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2100) {
      return { success: true, dateString: `${y}-${m}-${day}` };
    }
  }

  return { success: false, error: `Invalid birth date format "${str}"` };
}
