import type { UserProfile } from '@qr-attendance/types';
import { AppStorage } from './storage';

/**
 * Computes a SHA-256 hexadecimal hash string for offline credential verification.
 */
export async function computeSha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);

  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.digest === 'function'
  ) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback hash implementation for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}`;
}

export interface OfflineAuthRecord {
  salt: string;
  hash: string;
  email: string;
  userId: string;
  profile: UserProfile;
  lastSavedAt: string;
}

export async function saveOfflineAuthCredentials(
  storagePrefix: string,
  email: string,
  password: string,
  profile: UserProfile,
  userId: string
): Promise<void> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const salt =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);
    const hash = await computeSha256Hex(`${salt}:${cleanEmail}:${password}`);

    const record: OfflineAuthRecord = {
      salt,
      hash,
      email: cleanEmail,
      userId,
      profile,
      lastSavedAt: new Date().toISOString(),
    };

    AppStorage.setJSON(`${storagePrefix}_offline_auth_record`, record);
    AppStorage.setItem(`${storagePrefix}_offline_session_active`, 'true');
  } catch (err) {
    console.warn('Could not cache offline auth credentials:', err);
  }
}

export async function verifyOfflineAuthCredentials(
  storagePrefix: string,
  email: string,
  password: string
): Promise<{ success: boolean; profile?: UserProfile; userId?: string; error?: string }> {
  try {
    const record = AppStorage.getJSON<OfflineAuthRecord | null>(
      `${storagePrefix}_offline_auth_record`,
      null
    );
    if (!record) {
      return {
        success: false,
        error:
          'No cached account found on this device. Please connect to the internet to sign in first.',
      };
    }

    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail !== record.email) {
      return {
        success: false,
        error: `Offline sign-in on this device is registered to "${record.email}". Please connect to the internet to sign in with a different account.`,
      };
    }

    const testHash = await computeSha256Hex(`${record.salt}:${cleanEmail}:${password}`);
    if (testHash !== record.hash) {
      return {
        success: false,
        error:
          'Incorrect password for offline sign-in. Please use the password from your last online session.',
      };
    }

    // Mark session active
    AppStorage.setItem(`${storagePrefix}_offline_session_active`, 'true');

    return {
      success: true,
      profile: record.profile,
      userId: record.userId,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify offline credentials.',
    };
  }
}

export function getStoredOfflineUser(
  storagePrefix: string
): { userId: string; email: string; profile: UserProfile } | null {
  try {
    const isActive = AppStorage.getItem(`${storagePrefix}_offline_session_active`) === 'true';
    if (!isActive) return null;

    const record = AppStorage.getJSON<OfflineAuthRecord | null>(
      `${storagePrefix}_offline_auth_record`,
      null
    );
    if (!record) return null;

    return {
      userId: record.userId,
      email: record.email,
      profile: record.profile,
    };
  } catch {
    return null;
  }
}

export function clearOfflineAuthSession(storagePrefix: string): void {
  try {
    AppStorage.removeItem(`${storagePrefix}_offline_session_active`);
  } catch {
    // Ignore
  }
}
