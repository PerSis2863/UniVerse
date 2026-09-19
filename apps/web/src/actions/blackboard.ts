'use server';

import prisma from '@/lib/db';

export async function getCourseData(courseCode: string) {
  try {
    const course = await prisma.course.findUnique({
      where: { code: courseCode },
      include: {
        announcements: true,
        quizzes: {
          include: { submissions: true }
        }
      }
    });
    return course;
  } catch (error) {
    console.error('Failed to fetch course from DB:', error);
    return null;
  }
}

export async function getUserMessages(userId: string) {
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    return messages;
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return [];
  }
}
