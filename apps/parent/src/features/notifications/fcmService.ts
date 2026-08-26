import { getSupabaseClient } from '@qr-attendance/supabase';

export interface RegisterTokenParams {
  profileId: string;
  fcmToken: string;
  platform?: 'web' | 'android' | 'ios';
  deviceName?: string;
  studentId?: string;
  parentId?: string;
}

export async function registerDeviceToken(params: RegisterTokenParams): Promise<boolean> {
  const client = getSupabaseClient();
  try {
    const tokenRecord = {
      profile_id: params.profileId,
      fcm_token: params.fcmToken,
      platform: params.platform || ('web' as const),
      device_name:
        params.deviceName ||
        (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'Browser'),
      student_id: params.studentId || null,
      parent_id: params.parentId || null,
      is_active: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('device_tokens').upsert(tokenRecord, {
      onConflict: 'fcm_token',
    });

    if (error) {
      console.warn('Could not register device token in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error in registerDeviceToken:', err);
    return false;
  }
}

export async function deactivateDeviceToken(fcmToken: string): Promise<void> {
  const client = getSupabaseClient();
  try {
    await client
      .from('device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('fcm_token', fcmToken);
  } catch (err) {
    console.warn('Error deactivating device token:', err);
  }
}

export async function requestPushPermissionAndRegister(
  profileId: string,
  studentId?: string
): Promise<string | null> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    console.warn('Push notifications are not supported in this browser environment.');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Push notification permission was not granted.');
    return null;
  }

  try {
    await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const clientToken = `web-push-${profileId.slice(0, 8)}-${Date.now()}`;

    await registerDeviceToken({
      profileId,
      fcmToken: clientToken,
      platform: 'web',
      studentId,
    });

    return clientToken;
  } catch (err) {
    console.error('Failed to register service worker / token:', err);
    return null;
  }
}
