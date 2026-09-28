import { z } from 'zod';
import { AnnouncementTarget, QuizStatus } from '@prisma/client';
import { BadRequestException } from './http';

// Request body rules from the old API's class-validator DTOs (apps/api/src/*/dto). Like its
// ValidationPipe (whitelist + forbidNonWhitelisted), unknown properties are rejected.

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'must be a valid ISO 8601 date string' });

export const CreateQuizDto = z
  .object({
    courseId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    dueDate: isoDate.optional(),
    timeLimit: z.number().int().optional(),
    status: z.nativeEnum(QuizStatus).optional(),
  })
  .strict();
export const UpdateQuizDto = CreateQuizDto.partial();

const credentialFields = {
  title: z.string().trim().min(3).max(120),
  projectName: z.string().trim().min(2).max(160),
  organization: z.string().trim().min(2).max(160),
  hoursCompleted: z.number().int().min(0).max(10000),
  peopleImpacted: z.number().int().min(0).max(10000000),
  description: z.string().max(2000).optional(),
  evidenceUrl: z
    .string()
    .max(500)
    .refine((s) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s), { message: 'evidenceUrl must be a full URL (https://...)' })
    .optional(),
};
export const RequestCredentialDto = z.object(credentialFields).strict();
export const IssueCredentialDto = z.object({ ...credentialFields, studentId: z.string().min(1) }).strict();
export const CredentialDecisionDto = z.object({ reason: z.string().max(500).optional() }).strict();

export const CreateAnnouncementDto = z
  .object({
    title: z.string(),
    body: z.string(),
    target: z.nativeEnum(AnnouncementTarget).optional(),
    courseId: z.string().optional(),
  })
  .strict();
export const UpdateAnnouncementDto = CreateAnnouncementDto.partial();

export const CreateKnowledgeHubDto = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    url: z.string().url().optional(),
    courseId: z.string().optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();
export const UpdateKnowledgeHubDto = CreateKnowledgeHubDto.partial();

export const CreateTicketDto = z
  .object({
    subject: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
  })
  .strict();

// Explicit types: with `strict: false` in tsconfig, z.infer would mark every field optional.
export interface CreateQuizDto { courseId: string; title: string; description?: string; dueDate?: string; timeLimit?: number; status?: QuizStatus }
export type UpdateQuizDto = Partial<CreateQuizDto>;
export interface RequestCredentialDto {
  title: string; projectName: string; organization: string; hoursCompleted: number; peopleImpacted: number;
  description?: string; evidenceUrl?: string;
}
export interface IssueCredentialDto extends RequestCredentialDto { studentId: string }
export interface CredentialDecisionDto { reason?: string }
export interface CreateAnnouncementDto { title: string; body: string; target?: AnnouncementTarget; courseId?: string }
export type UpdateAnnouncementDto = Partial<CreateAnnouncementDto>;
export interface CreateKnowledgeHubDto { title: string; description?: string; category?: string; url?: string; courseId?: string; isPublic?: boolean }
export type UpdateKnowledgeHubDto = Partial<CreateKnowledgeHubDto>;
export interface CreateTicketDto { subject: string; description: string; category: string }

/** Validates a request body, answering 400 with the list of problems like NestJS's ValidationPipe. */
export function validate<T>(schema: z.ZodTypeAny, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data as T;
  const message = result.error.issues.map((i) =>
    i.code === 'unrecognized_keys' ? i.keys.map((k) => `property ${k} should not exist`).join(', ') : `${i.path.join('.') || 'body'} ${i.message}`,
  );
  throw new BadRequestException({ message, error: 'Bad Request' });
}
