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
  teacher_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClassSectionWithDetails extends ClassSection {
  school_year_name?: string;
  teacher_name?: string;
  student_count?: number;
}

