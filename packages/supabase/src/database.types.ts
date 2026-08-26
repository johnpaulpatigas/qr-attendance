export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: 'teacher' | 'admin' | 'parent' | 'student';
          full_name: string;
          email?: string;
          avatar_url?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: 'teacher' | 'admin' | 'parent' | 'student';
          full_name: string;
          email?: string;
          avatar_url?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: 'teacher' | 'admin' | 'parent' | 'student';
          full_name?: string;
          email?: string;
          avatar_url?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          lrn: string;
          last_name: string;
          first_name: string;
          middle_name: string | null;
          suffix: string | null;
          sex: 'MALE' | 'FEMALE';
          birth_date: string;
          grade_level: number;
          section_id: string;
          school_year_id: string;
          qr_identifier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lrn: string;
          last_name: string;
          first_name: string;
          middle_name?: string | null;
          suffix?: string | null;
          sex: 'MALE' | 'FEMALE';
          birth_date: string;
          grade_level: number;
          section_id: string;
          school_year_id: string;
          qr_identifier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lrn?: string;
          last_name?: string;
          first_name?: string;
          middle_name?: string | null;
          suffix?: string | null;
          sex?: 'MALE' | 'FEMALE';
          birth_date?: string;
          grade_level?: number;
          section_id?: string;
          school_year_id?: string;
          qr_identifier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      parents: {
        Row: {
          id: string;
          profile_id: string;
          contact_information: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          contact_information?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          contact_information?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_parents: {
        Row: {
          student_id: string;
          parent_id: string;
          relationship: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          student_id: string;
          parent_id: string;
          relationship?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          student_id?: string;
          parent_id?: string;
          relationship?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      school_years: {
        Row: {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          start_date: string;
          end_date: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      class_sections: {
        Row: {
          id: string;
          grade_level: number;
          section_name: string;
          room_number: string | null;
          school_year_id: string;
          teacher_id: string | null;
          adviser_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          grade_level: number;
          section_name: string;
          room_number?: string | null;
          school_year_id: string;
          teacher_id?: string | null;
          adviser_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          grade_level?: number;
          section_name?: string;
          room_number?: string | null;
          school_year_id?: string;
          teacher_id?: string | null;
          adviser_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      section_subject_teachers: {
        Row: {
          id: string;
          class_id: string;
          subject_name: string;
          teacher_id: string;
          schedule_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          subject_name: string;
          teacher_id: string;
          schedule_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          subject_name?: string;
          teacher_id?: string;
          schedule_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_sessions: {
        Row: {
          id: string;
          class_id: string;
          teacher_id: string;
          attendance_date: string;
          session_type: 'morning' | 'afternoon';
          subject_name: string | null;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          teacher_id: string;
          attendance_date: string;
          session_type: 'morning' | 'afternoon';
          subject_name?: string | null;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          teacher_id?: string;
          attendance_date?: string;
          session_type?: 'morning' | 'afternoon';
          subject_name?: string | null;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          student_id: string;
          class_id: string;
          attendance_session_id: string;
          attendance_date: string;
          attendance_type: 'morning' | 'afternoon';
          subject_name: string | null;
          status: 'present' | 'late' | 'absent' | 'excused';
          recorded_at: string;
          recorded_by: string;
          source: 'qr_scan' | 'manual' | 'import' | 'correction';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          class_id: string;
          attendance_session_id: string;
          attendance_date: string;
          attendance_type: 'morning' | 'afternoon';
          subject_name?: string | null;
          status: 'present' | 'late' | 'absent' | 'excused';
          recorded_at?: string;
          recorded_by: string;
          source?: 'qr_scan' | 'manual' | 'import' | 'correction';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          class_id?: string;
          attendance_session_id?: string;
          attendance_date?: string;
          attendance_type?: 'morning' | 'afternoon';
          subject_name?: string | null;
          status?: 'present' | 'late' | 'absent' | 'excused';
          recorded_at?: string;
          recorded_by?: string;
          source?: 'qr_scan' | 'manual' | 'import' | 'correction';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_events: {
        Row: {
          id: string;
          attendance_id: string;
          student_id: string;
          teacher_id: string | null;
          event_type:
            | 'scanned'
            | 'marked_present'
            | 'marked_late'
            | 'marked_absent'
            | 'marked_excused'
            | 'corrected'
            | 'deleted';
          timestamp: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          attendance_id: string;
          student_id: string;
          teacher_id: string | null;
          event_type:
            | 'scanned'
            | 'marked_present'
            | 'marked_late'
            | 'marked_absent'
            | 'marked_excused'
            | 'corrected'
            | 'deleted';
          timestamp?: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          attendance_id?: string;
          student_id?: string;
          teacher_id?: string | null;
          event_type?:
            | 'scanned'
            | 'marked_present'
            | 'marked_late'
            | 'marked_absent'
            | 'marked_excused'
            | 'corrected'
            | 'deleted';
          timestamp?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          id: string;
          profile_id: string;
          student_id: string | null;
          parent_id: string | null;
          fcm_token: string;
          platform: 'web' | 'android' | 'ios';
          device_name: string | null;
          is_active: boolean;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          student_id?: string | null;
          parent_id?: string | null;
          fcm_token: string;
          platform?: 'web' | 'android' | 'ios';
          device_name?: string | null;
          is_active?: boolean;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          student_id?: string | null;
          parent_id?: string | null;
          fcm_token?: string;
          platform?: 'web' | 'android' | 'ios';
          device_name?: string | null;
          is_active?: boolean;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          id: string;
          recipient_profile_id: string;
          student_id: string;
          attendance_id: string | null;
          notification_type:
            'attendance_present' | 'attendance_late' | 'attendance_absent' | 'general';
          status: 'pending' | 'sent' | 'failed';
          fcm_token: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_profile_id: string;
          student_id: string;
          attendance_id?: string | null;
          notification_type:
            'attendance_present' | 'attendance_late' | 'attendance_absent' | 'general';
          status?: 'pending' | 'sent' | 'failed';
          fcm_token?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_profile_id?: string;
          student_id?: string;
          attendance_id?: string | null;
          notification_type?:
            'attendance_present' | 'attendance_late' | 'attendance_absent' | 'general';
          status?: 'pending' | 'sent' | 'failed';
          fcm_token?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      verify_student_lrn: {
        Args: {
          target_lrn: string;
        };
        Returns: {
          exists: boolean;
          student_name?: string;
          grade_level?: number;
          section_name?: string;
        };
      };
      link_student_to_parent: {
        Args: {
          target_lrn: string;
          relation_name?: string;
        };
        Returns: {
          success: boolean;
          message: string;
          student_id?: string;
          student_name?: string;
        };
      };
      is_parent_of_student: {
        Args: {
          target_student_id: string;
        };
        Returns: boolean;
      };
      is_teacher: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: 'teacher' | 'admin' | 'parent' | 'student';
      session_type: 'morning' | 'afternoon';
      attendance_status: 'present' | 'late' | 'absent' | 'excused';
      attendance_source: 'qr_scan' | 'manual' | 'import' | 'correction';
      notification_type: 'attendance_present' | 'attendance_late' | 'attendance_absent' | 'general';
    };
  };
};
