export type Gender = 'MALE' | 'FEMALE';

export interface Student {
  id: string; // UUID primary key
  lrn: string; // DepEd 12-digit Learner Reference Number
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  sex: Gender;
  birth_date: string; // YYYY-MM-DD
  grade_level: number;
  section_id: string;
  school_year_id: string;
  qr_identifier: string; // Unique random UUID or stable identifier used in QR
  created_at: string;
  updated_at: string;
}

export interface StudentWithSection extends Student {
  section_name?: string;
  school_year_name?: string;
}
