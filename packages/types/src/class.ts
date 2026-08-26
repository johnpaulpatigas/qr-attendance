export interface SchoolYear {
  id: string; // UUID
  name: string; // e.g. '2026-2027'
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  is_active: boolean;
  created_at: string;
}

export interface ClassSection {
  id: string;
  grade_level: number;
  section_name: string;
  room_number?: string | null;
  school_year_id: string;
  teacher_id: string | null; // Homeroom Adviser ID (for backwards compatibility)
  adviser_id?: string | null; // Homeroom Adviser ID
  created_at?: string;
  updated_at?: string;
}

export interface SectionSubjectTeacher {
  id: string;
  class_id: string;
  subject_name: string; // e.g. 'Mathematics', 'Science', 'English', etc.
  teacher_id: string;
  teacher_name?: string;
  schedule_time?: string | null; // e.g. '7:30 AM - 8:30 AM M-F'
  created_at?: string;
}

export interface ClassSectionWithDetails extends ClassSection {
  school_year_name?: string;
  teacher_name?: string;
  adviser_name?: string;
  student_count?: number;
  subject_teachers?: SectionSubjectTeacher[];
  my_role?: 'adviser' | 'subject_teacher';
  my_subject?: string;
}
