const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Users
  const teacherMehta = await prisma.user.upsert({
    where: { email: 'mehta@universe.edu' },
    update: {},
    create: {
      email: 'mehta@universe.edu',
      name: 'Prof. Mehta',
      role: 'TEACHER',
      avatarUrl: 'PM',
    },
  });

  const studentAditya = await prisma.user.upsert({
    where: { email: 'aditya@universe.edu' },
    update: {},
    create: {
      email: 'aditya@universe.edu',
      name: 'Aditya Bhatt',
      role: 'STUDENT',
      avatarUrl: 'AB',
    },
  });

  const studentPriya = await prisma.user.upsert({
    where: { email: 'priya@universe.edu' },
    update: {},
    create: {
      email: 'priya@universe.edu',
      name: 'Priya Sharma',
      role: 'STUDENT',
      avatarUrl: 'PS',
    },
  });

  const studentRahul = await prisma.user.upsert({
    where: { email: 'rahul@universe.edu' },
    update: {},
    create: {
      email: 'rahul@universe.edu',
      name: 'Rahul Kumar',
      role: 'STUDENT',
      avatarUrl: 'RK',
    },
  });

  // 2. Create Course
  const courseCS301 = await prisma.course.upsert({
    where: { code: 'CS301' },
    update: {},
    create: {
      code: 'CS301',
      name: 'Data Structures & Algorithms',
      description: 'Learn foundational computer science algorithms and data structures.',
      color: '#6366f1',
      teacherId: teacherMehta.id,
    },
  });

  // 3. Enroll Students
  const students = [studentAditya, studentPriya, studentRahul];
  for (const student of students) {
    await prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: student.id,
          courseId: courseCS301.id,
        },
      },
      update: {},
      create: {
        userId: student.id,
        courseId: courseCS301.id,
      },
    });
  }

  // 4. Create Announcements
  await prisma.announcement.createMany({
    data: [
      {
        title: 'Midterm Exam Details',
        body: 'The midterm will cover chapters 1–8. Open book, 90 minutes. Room: Main Hall A.',
        priority: 'high',
        pinned: true,
        authorId: teacherMehta.id,
        courseId: courseCS301.id,
      },
      {
        title: 'Office Hours This Week',
        body: 'Office hours moved to Wednesday 3–5 PM due to faculty meeting. Room 302.',
        priority: 'normal',
        pinned: false,
        authorId: teacherMehta.id,
        courseId: courseCS301.id,
      },
    ],
  });

  // 5. Create Assignments
  const assignmentDef = await prisma.assignmentDef.create({
    data: {
      title: 'Assignment 3: Graph Traversal',
      description: 'Implement BFS and DFS on a weighted graph.',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      maxScore: 100,
      courseId: courseCS301.id,
    },
  });

  await prisma.assignment.create({
    data: {
      assignmentDefId: assignmentDef.id,
      studentId: studentAditya.id,
      status: 'pending',
    },
  });

  console.log('Seed completed successfully.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
