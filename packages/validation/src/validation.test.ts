import { describe, it, expect } from 'vitest';
import {
  lrnSchema,
  createQrPayload,
  parseQrPayload,
  validateSf1Row,
  createStudentSchema,
  manualAttendanceCorrectionSchema,
  loginSchema,
} from './index';

describe('LRN Schema Validation', () => {
  it('accepts valid 12-digit numeric LRNs', () => {
    expect(lrnSchema.safeParse('108234981234').success).toBe(true);
    expect(lrnSchema.safeParse('123456789012').success).toBe(true);
  });

  it('rejects LRN with less than 12 digits', () => {
    const result = lrnSchema.safeParse('12345');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('12 numeric digits');
    }
  });

  it('rejects LRN with more than 12 digits', () => {
    const result = lrnSchema.safeParse('1234567890123');
    expect(result.success).toBe(false);
  });

  it('rejects LRN with non-numeric characters', () => {
    const result = lrnSchema.safeParse('10823498123A');
    expect(result.success).toBe(false);
  });
});

describe('QR Payload Creation & Parsing', () => {
  it('creates valid ATTENDANCE:<identifier> format', () => {
    const uuid = '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c';
    const payload = createQrPayload(uuid);
    expect(payload).toBe(`ATTENDANCE:${uuid}`);
  });

  it('parses valid QR payload successfully', () => {
    const uuid = '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c';
    const parsed = parseQrPayload(`ATTENDANCE:${uuid}`);
    expect(parsed.success).toBe(true);
    expect(parsed.identifier).toBe(uuid);
  });

  it('rejects QR payload with missing prefix', () => {
    const parsed = parseQrPayload('STUDENT:12345');
    expect(parsed.success).toBe(false);
    expect(parsed.identifier).toBeUndefined();
  });

  it('rejects empty QR payload', () => {
    const parsed = parseQrPayload('');
    expect(parsed.success).toBe(false);
  });
});

describe('SF1 Row Validator', () => {
  it('validates a complete and correct DepEd SF1 row', () => {
    const result = validateSf1Row({
      lrn: '108234981234',
      last_name: 'Dela Cruz',
      first_name: 'Juan',
      middle_name: 'Mercado',
      sex: 'MALE',
      birth_date: '2008-05-14',
      grade_level: 12,
      section_name: 'STEM A',
      school_year: '2026-2027',
    });

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.last_name).toBe('Dela Cruz');
    expect(result.first_name).toBe('Juan');
  });

  it('flags invalid LRN in SF1 row', () => {
    const result = validateSf1Row({
      lrn: '999',
      last_name: 'Santos',
      first_name: 'Maria',
      sex: 'FEMALE',
      birth_date: '2008-09-22',
      grade_level: 12,
      section_name: 'STEM A',
      school_year: '2026-2027',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('12 numeric digits'))).toBe(true);
  });

  it('flags missing required names in SF1 row', () => {
    const result = validateSf1Row({
      lrn: '108234981235',
      last_name: '',
      first_name: '',
      sex: 'FEMALE',
      birth_date: '2008-09-22',
      grade_level: 12,
      section_name: 'STEM A',
      school_year: '2026-2027',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Last name is required'))).toBe(true);
    expect(result.errors.some((e) => e.includes('First name is required'))).toBe(true);
  });
});

describe('Student Creation Schema', () => {
  it('validates a complete student creation payload', () => {
    const valid = createStudentSchema.safeParse({
      lrn: '108234981234',
      last_name: 'Dela Cruz',
      first_name: 'Juan',
      middle_name: 'Mercado',
      suffix: null,
      sex: 'MALE',
      birth_date: '2008-05-14',
      grade_level: 12,
      section_id: 'e0123456-789a-bcde-f012-3456789abc01',
      school_year_id: 'e0123456-789a-bcde-f012-3456789abc02',
    });
    expect(valid.success).toBe(true);
  });
});

describe('Attendance Correction Schema', () => {
  it('requires a reason of at least 3 characters for manual corrections', () => {
    const valid = manualAttendanceCorrectionSchema.safeParse({
      attendance_id: 'e0123456-789a-bcde-f012-3456789abcde',
      status: 'present',
      reason: 'Student arrived with valid excuse letter from parent',
    });
    expect(valid.success).toBe(true);

    const tooShort = manualAttendanceCorrectionSchema.safeParse({
      attendance_id: 'e0123456-789a-bcde-f012-3456789abcde',
      status: 'present',
      reason: 'ab',
    });
    expect(tooShort.success).toBe(false);
  });
});

describe('Authentication Schema', () => {
  it('validates standard email and password length', () => {
    const valid = loginSchema.safeParse({
      email: 'teacher@school.edu.ph',
      password: 'StrongPassword123',
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'StrongPassword123',
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = loginSchema.safeParse({
      email: 'teacher@school.edu.ph',
      password: '123',
    });
    expect(shortPassword.success).toBe(false);
  });
});
