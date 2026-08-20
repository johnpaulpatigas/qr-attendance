/**
 * Utility functions for UTC+8 (Asia/Manila) date and time calculations.
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
