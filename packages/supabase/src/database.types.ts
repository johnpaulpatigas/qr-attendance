import {
  UserProfile,
  Student,
  Parent,
  StudentParent,
  SchoolYear,
  ClassSection,
  AttendanceSession,
  AttendanceRecord,
  AttendanceEvent,
  DeviceToken,
  NotificationLog,
} from '@qr-attendance/types';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserProfile, 'id'>>;
      };
      students: {
        Row: Student;
        Insert: Omit<Student, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Student, 'id'>>;
      };
      parents: {
        Row: Parent;
        Insert: Omit<Parent, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Parent, 'id'>>;
      };
      student_parents: {
        Row: StudentParent;
        Insert: StudentParent;
        Update: Partial<StudentParent>;
      };
      school_years: {
        Row: SchoolYear;
        Insert: Omit<SchoolYear, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<SchoolYear, 'id'>>;
      };
      class_sections: {
        Row: ClassSection;
        Insert: Omit<ClassSection, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ClassSection, 'id'>>;
      };
      attendance_sessions: {
        Row: AttendanceSession;
        Insert: Omit<AttendanceSession, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<AttendanceSession, 'id'>>;
      };
      attendance: {
        Row: AttendanceRecord;
        Insert: Omit<AttendanceRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<AttendanceRecord, 'id'>>;
      };
      attendance_events: {
        Row: AttendanceEvent;
        Insert: Omit<AttendanceEvent, 'id' | 'timestamp'> & {
          id?: string;
          timestamp?: string;
        };
        Update: Partial<Omit<AttendanceEvent, 'id'>>;
      };
      device_tokens: {
        Row: DeviceToken;
        Insert: Omit<DeviceToken, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DeviceToken, 'id'>>;
      };
      notification_logs: {
        Row: NotificationLog;
        Insert: Omit<NotificationLog, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<NotificationLog, 'id'>>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: 'teacher' | 'admin' | 'parent' | 'student';
      session_type: 'morning' | 'afternoon';
      attendance_status: 'present' | 'late' | 'absent' | 'excused';
      attendance_source: 'qr_scan' | 'manual' | 'import' | 'correction';
      notification_type:
        | 'attendance_present'
        | 'attendance_late'
        | 'attendance_absent'
        | 'general';
    };
  };
}
