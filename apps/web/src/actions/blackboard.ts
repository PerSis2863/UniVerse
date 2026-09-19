'use server';

import prisma from '@/lib/db';
import { BLACKBOARD_DATA } from '@/lib/mock-data';

// Fallback utility for demo/Vercel deployment where SQLite might not be seeded or available
const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';

export async function getCourseData(courseCode: string) {
  if (USE_MOCK_DATA) {
    // @ts-ignore
    return BLACKBOARD_DATA[courseCode] || null;
  }

  try {
    const course = await prisma.course.findUnique({
      where: { code: courseCode },
      include: {
        announcements: true,
        resources: true,
        assignments: {
          include: { submissions: true }
        }
      }
    });
    return course;
  } catch (error) {
    console.error('Failed to fetch course from DB, falling back to mock data:', error);
    // @ts-ignore
    return BLACKBOARD_DATA[courseCode] || null;
  }
}

export async function getUserMessages(userId: string) {
  if (USE_MOCK_DATA) {
    return []; // Mock data handled directly in components for now
  }
  
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
