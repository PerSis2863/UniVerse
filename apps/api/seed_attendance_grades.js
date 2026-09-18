const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const student = await prisma.user.findFirst({ where: { email: 'student@universe.edu' }});
  const course = await prisma.course.findFirst({ where: { code: 'CS101' }});

  if (!student || !course) return console.log('Missing basic seed data (users/course).');

  console.log('Seeding Attendance and Grades for CS101...');

  // 10 attendance records
  for (let i = 0; i < 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i); // past 10 days
    await prisma.attendance.upsert({
      where: {
        studentId_courseId_date: {
          studentId: student.id,
          courseId: course.id,
          date: d
        }
      },
      update: {},
      create: {
        studentId: student.id,
        courseId: course.id,
        date: d,
        status: i % 5 === 0 ? 'ABSENT' : (i % 7 === 0 ? 'LATE' : 'PRESENT')
      }
    });
  }

  // A few grades
  const assignments = [
    { name: 'Midterm Exam', score: 85, maxScore: 100 },
    { name: 'Homework 1', score: 90, maxScore: 100 },
    { name: 'Homework 2', score: 100, maxScore: 100 },
    { name: 'Pop Quiz', score: 8, maxScore: 10 }
  ];

  for (const a of assignments) {
    // just create them
    await prisma.grade.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        assignmentName: a.name,
        score: a.score,
        maxScore: a.maxScore,
        status: 'GRADED'
      }
    });
  }

  console.log('Done seeding attendance & grades.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
