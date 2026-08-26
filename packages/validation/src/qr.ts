import { z } from 'zod';

export const QR_PREFIX = 'ATTENDANCE:';

export const qrPayloadSchema = z
  .string()
  .trim()
  .refine((val) => val.startsWith(QR_PREFIX) && val.length > QR_PREFIX.length, {
    message: `QR code must begin with "${QR_PREFIX}" followed by a valid student identifier`,
  });

export function createQrPayload(qrIdentifier: string): string {
  return `${QR_PREFIX}${qrIdentifier.trim()}`;
}

export function parseQrPayload(rawPayload: string): {
  success: boolean;
  identifier?: string;
  error?: string;
} {
  const trimmed = (rawPayload || '').trim();
  if (!trimmed.startsWith(QR_PREFIX)) {
    return {
      success: false,
      error: 'Invalid QR code format. Missing ATTENDANCE prefix.',
    };
  }

  const identifier = trimmed.slice(QR_PREFIX.length).trim();
  if (!identifier) {
    return {
      success: false,
      error: 'Invalid QR code. Empty student identifier.',
    };
  }

  return {
    success: true,
    identifier,
  };
}
