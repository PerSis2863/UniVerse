'use server';

import prisma from '@/lib/db';

import { unstable_cache } from 'next/cache';

export const getCourseData = unstable_cache(
  async (courseCode: string) => {
    try {
      const course = await prisma.course.findUnique({
        where: { code: courseCode },
        include: {
          announcements: true,
        }
      });
      return course;
    } catch (error) {
      console.error('Failed to fetch course from DB:', error);
      return null;
    }
  },
  ['course-data'],
  { revalidate: 60 }
);

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
