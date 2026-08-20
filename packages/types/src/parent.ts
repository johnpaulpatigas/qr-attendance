export interface Parent {
  id: string; // UUID primary key
  profile_id: string; // References profiles.id
  contact_information: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StudentParent {
  student_id: string;
  parent_id: string;
  relationship: string; // e.g., 'Father', 'Mother', 'Guardian'
  is_primary: boolean;
  created_at?: string;
}

export interface LinkedStudent {
  student_id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  grade_level: number;
  section_name: string;
  relationship: string;
  is_primary: boolean;
}
