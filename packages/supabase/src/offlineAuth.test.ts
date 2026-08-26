import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeSha256Hex,
  saveOfflineAuthCredentials,
  verifyOfflineAuthCredentials,
  getStoredOfflineUser,
  clearOfflineAuthSession,
} from './offlineAuth';
import type { UserProfile } from '@qr-attendance/types';

describe('Offline Authentication Service', () => {
  const prefix = 'test_teacher';
  const mockProfile: UserProfile = {
    id: 'e0123456-789a-bcde-f012-3456789abcde',
    role: 'teacher',
    full_name: 'Juan Dela Cruz',
    email: 'teacher@mnhs.edu.ph',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  };

  const storageMap = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    (globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage =
      localStorageMock;
    localStorageMock.clear();
  });

  it('computes consistent deterministic SHA-256 hash for given input', async () => {
    const hash1 = await computeSha256Hex('salt123:test@example.com:password123');
    const hash2 = await computeSha256Hex('salt123:test@example.com:password123');
    const diffHash = await computeSha256Hex('salt123:test@example.com:otherpass');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(diffHash);
    expect(hash1.length).toBeGreaterThan(10);
  });

  it('saves credentials and successfully verifies correct password when offline', async () => {
    await saveOfflineAuthCredentials(
      prefix,
      'Teacher@MNHS.edu.ph', // Case-insensitive normalization
      'TeacherPassword123!',
      mockProfile,
      mockProfile.id
    );

    const result = await verifyOfflineAuthCredentials(
      prefix,
      'teacher@mnhs.edu.ph',
      'TeacherPassword123!'
    );

    expect(result.success).toBe(true);
    expect(result.userId).toBe(mockProfile.id);
    expect(result.profile?.full_name).toBe('Juan Dela Cruz');
  });

  it('rejects verification with wrong password', async () => {
    await saveOfflineAuthCredentials(
      prefix,
      'teacher@mnhs.edu.ph',
      'CorrectPassword123',
      mockProfile,
      mockProfile.id
    );

    const result = await verifyOfflineAuthCredentials(
      prefix,
      'teacher@mnhs.edu.ph',
      'WrongPassword456'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Incorrect password');
  });

  it('rejects verification for an email that was not previously authenticated', async () => {
    await saveOfflineAuthCredentials(
      prefix,
      'teacher1@mnhs.edu.ph',
      'Password123',
      mockProfile,
      mockProfile.id
    );

    const result = await verifyOfflineAuthCredentials(
      prefix,
      'different_teacher@mnhs.edu.ph',
      'Password123'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('different account');
  });

  it('retrieves active offline session and clears on logout', async () => {
    await saveOfflineAuthCredentials(
      prefix,
      'teacher@mnhs.edu.ph',
      'Password123',
      mockProfile,
      mockProfile.id
    );

    const activeUser = getStoredOfflineUser(prefix);
    expect(activeUser).not.toBeNull();
    expect(activeUser?.userId).toBe(mockProfile.id);

    clearOfflineAuthSession(prefix);
    const clearedUser = getStoredOfflineUser(prefix);
    expect(clearedUser).toBeNull();
  });
});
