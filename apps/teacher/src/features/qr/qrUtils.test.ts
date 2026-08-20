import { describe, it, expect } from 'vitest';
import { getStudentQrPayload, validateScannedQr } from './qrUtils';

describe('Teacher QR Utilities', () => {
  it('formats student QR payload properly', () => {
    const qrId = '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c';
    const payload = getStudentQrPayload(qrId);
    expect(payload).toBe(`ATTENDANCE:${qrId}`);
  });

  it('validates scanned QR payload and extracts student identifier', () => {
    const qrId = '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c';
    const raw = `ATTENDANCE:${qrId}`;
    const result = validateScannedQr(raw);
    expect(result.success).toBe(true);
    expect(result.identifier).toBe(qrId);
  });

  it('fails gracefully on malformed scanned payload', () => {
    const result = validateScannedQr('RANDOM_BARCODE');
    expect(result.success).toBe(false);
  });
});
