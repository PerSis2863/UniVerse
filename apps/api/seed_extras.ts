import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teacher = await prisma.user.findFirst({ where: { email: 'teacher@universe.edu' }});
  const admin = await prisma.user.findFirst({ where: { email: 'admin@universe.edu' }});
  const course = await prisma.course.findFirst({ where: { code: 'CS101' }});

  if (!teacher || !admin || !course) return console.log('Missing basic seed data. Run main seed first.');

  await prisma.quiz.create({
    data: {
      title: 'Introduction to Computer Science',
      description: 'A basic quiz covering the first week of material.',
      courseId: course.id,
      status: 'PUBLISHED',
      timeLimit: 30,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  await prisma.announcement.create({
    data: {
      title: 'Welcome to the new semester!',
      body: 'We are excited to have you all here. Please review the syllabus.',
      authorId: admin.id,
      target: 'ALL'
    }
  });

  await prisma.knowledgeHubResource.create({
    data: {
      title: 'How to write a good research paper',
      description: 'A comprehensive guide for college students.',
      category: 'Research',
      url: 'https://example.com/guide',
      authorId: teacher.id
    }
  });

  console.log('Extra seed completed!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
