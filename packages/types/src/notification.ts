export type NotificationPlatform = 'web' | 'android' | 'ios';

export type NotificationType =
  | 'attendance_present'
  | 'attendance_late'
  | 'attendance_absent'
  | 'general';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface DeviceToken {
  id: string; // UUID
  profile_id: string; // References profiles.id
  student_id: string | null;
  parent_id: string | null;
  fcm_token: string;
  platform: NotificationPlatform;
  device_name: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string; // UUID
  recipient_profile_id: string; // References profiles.id
  student_id: string;
  attendance_id: string;
  notification_type: NotificationType;
  status: NotificationStatus;
  fcm_token: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}
