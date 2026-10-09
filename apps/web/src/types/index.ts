export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
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
  /** Only set (true) for the platform owner; the server decides and re-checks on every call. */
  owner?: boolean;
  /** Latest application to become a teacher / NGO representative, if any. */
  application?: ApplicationSummary | null;
  /** Staff only: what their custom roles let them do (Stage 5 · B15.6; admins can do everything). */
  permissions?: string[];
}

export type ApplicationStatus = 'DRAFT' | 'PENDING' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export interface ApplicationSummary {
  id: string;
  status: ApplicationStatus;
  source: 'SIGNUP' | 'UPGRADE' | string;
  requestedRole: 'TEACHER' | 'ADMIN' | string;
  adminNote?: string | null;
}

/** Signed up as a teacher/NGO and still waiting: the app shows the application page instead of the student area. */
export const awaitingApproval = (u: Pick<User, 'role' | 'application'> | null | undefined) =>
  !!u && u.role === 'STUDENT' && u.application?.source === 'SIGNUP' && ['DRAFT', 'PENDING', 'NEEDS_INFO'].includes(u.application.status);

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
