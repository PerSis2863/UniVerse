// Stage 5 · C4: Shared types and valid enums for public REST API & Webhooks.
// Safe for both client components and server code.

export const VALID_API_SCOPES = [
  'courses.read',
  'courses.write',
  'students.read',
  'grades.read',
  'grades.write',
  'attendance.read',
  'attendance.write',
  'webhooks.manage',
] as const;

export type ApiScope = (typeof VALID_API_SCOPES)[number];

export const VALID_WEBHOOK_EVENTS = [
  'assignment.submitted',
  'grade.posted',
  'attendance.marked',
  'course.created',
  'member.joined',
] as const;

export type WebhookEvent = (typeof VALID_WEBHOOK_EVENTS)[number];
