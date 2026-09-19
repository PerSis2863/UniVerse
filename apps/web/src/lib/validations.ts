import { z } from 'zod';

export const MessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message is too long'),
  receiverId: z.string().min(1, 'Receiver is required'),
});

export const AnnouncementSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title is too long'),
  body: z.string().min(10, 'Announcement body must be at least 10 characters'),
  priority: z.enum(['low', 'normal', 'high']),
  courseId: z.string().min(1, 'Course ID is required'),
});

export const AssignmentSubmissionSchema = z.object({
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  content: z.string().min(1, 'Submission cannot be empty'),
  fileUrl: z.string().url().optional(),
});
