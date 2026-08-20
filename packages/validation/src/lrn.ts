import { z } from 'zod';

export const lrnRegex = /^\d{12}$/;

export const lrnSchema = z
  .string()
  .trim()
  .regex(lrnRegex, 'Learner Reference Number (LRN) must be exactly 12 numeric digits');

export function isValidLrn(lrn: string): boolean {
  return lrnRegex.test(lrn.trim());
}
