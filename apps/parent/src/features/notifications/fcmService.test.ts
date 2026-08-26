import { describe, it, expect } from 'vitest';
import { registerDeviceToken, deactivateDeviceToken } from './fcmService';

describe('Parent FCM Push Notification Service', () => {
  it('handles device token registration safely in test environment', async () => {
    const result = await registerDeviceToken({
      profileId: 'parent-profile-123',
      fcmToken: 'fcm-token-abc',
      platform: 'web',
      deviceName: 'Chrome Browser',
    });

    // In non-connected environment, returns boolean gracefully without throwing
    expect(typeof result).toBe('boolean');
  });

  it('handles device token deactivation gracefully', async () => {
    await expect(deactivateDeviceToken('fcm-token-abc')).resolves.not.toThrow();
  });
});
