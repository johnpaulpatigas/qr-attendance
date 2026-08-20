export type UserRole = 'teacher' | 'admin' | 'parent' | 'student';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  email?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherProfile extends UserProfile {
  role: 'teacher';
  department?: string;
  employee_id?: string;
}

export interface AdminProfile extends UserProfile {
  role: 'admin';
}
