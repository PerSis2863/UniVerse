export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatar?: string;
  phone?: string;
  createdAt: string;
  studentProfile?: StudentProfile;
  teacherProfile?: TeacherProfile;
}

export interface StudentProfile {
  id: string;
  studentId: string;
  department?: string;
  year: number;
  gpa: number;
}

export interface TeacherProfile {
  id: string;
  employeeId: string;
  department?: string;
  designation?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  credits: number;
  department?: string;
  color?: string;
  emoji?: string;
  teacher: Pick<User, 'id' | 'name' | 'avatar'>;
  _count?: { enrollments: number };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
