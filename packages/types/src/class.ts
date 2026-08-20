export interface SchoolYear {
  id: string; // UUID
  name: string; // e.g. '2026-2027'
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  is_active: boolean;
  created_at: string;
}

export interface ClassSection {
  id: string; // UUID
  grade_level: number; // e.g. 7, 8, 9, 10, 11, 12
  section_name: string; // e.g. 'Rizal', 'STEM-A'
  school_year_id: string; // References school_years.id
  teacher_id: string; // References profiles.id (teacher)
  created_at?: string;
  updated_at?: string;
}

export interface ClassSectionWithDetails extends ClassSection {
  school_year_name?: string;
  teacher_name?: string;
  student_count?: number;
}
