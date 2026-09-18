import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding more courses...');

  // Get teacher ID
  const teacher = await prisma.user.findUnique({ where: { email: 'teacher@universe.edu' } });
  if (!teacher) {
    console.error('Teacher not found!');
    return;
  }

  // Get student ID
  const student = await prisma.user.findUnique({ where: { email: 'student@universe.edu' } });
  if (!student) {
    console.error('Student not found!');
    return;
  }

  const courses = [
    { code: 'CS201', name: 'Data Structures and Algorithms', description: 'Advanced programming concepts focusing on data structures.', emoji: '🌳', color: '#10b981' },
    { code: 'MATH101', name: 'Calculus I', description: 'Limits, derivatives, and integrals.', emoji: '🧮', color: '#f59e0b' },
    { code: 'PHY101', name: 'General Physics', description: 'Mechanics, heat, and sound.', emoji: '⚛️', color: '#3b82f6' },
    { code: 'ENG101', name: 'English Composition', description: 'Foundations of academic writing.', emoji: '✍️', color: '#ec4899' },
    { code: 'HIS201', name: 'World History', description: 'From ancient civilizations to modern times.', emoji: '🌍', color: '#8b5cf6' },
  ];

  for (const c of courses) {
    const createdCourse = await prisma.course.upsert({
      where: { code: c.code },
      update: { status: 'PUBLISHED' },
      create: {
        code: c.code,
        name: c.name,
        description: c.description,
        emoji: c.emoji,
        color: c.color,
        teacherId: teacher.id,
        status: 'PUBLISHED',
      }
    });

    // Enroll student
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId: createdCourse.id } },
      update: {},
      create: {
        courseId: createdCourse.id,
        studentId: student.id,
      }
    });

    console.log(`Added course ${c.code} and enrolled student.`);
  }

  console.log('Done!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
