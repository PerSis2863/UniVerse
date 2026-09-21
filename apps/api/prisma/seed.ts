import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo accounts...');

  const passwordHashStudent = await bcrypt.hash('password', 10);
  const passwordHashTeacher = await bcrypt.hash('password', 10);
  const passwordHashAdmin = await bcrypt.hash('password', 10);

  // Student
  const student = await prisma.user.upsert({
    where: { email: 'demo@student.com' },
    update: {},
    create: {
      email: 'demo@student.com',
      password: passwordHashStudent,
      name: 'John Doe',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        create: {
          studentId: 'STU_DEMO_01',
          department: 'Computer Science',
          year: 2,
          gpa: 3.74,
        },
      },
    },
  });

  // Teacher
  const teacher = await prisma.user.upsert({
    where: { email: 'demo@teacher.com' },
    update: {},
    create: {
      email: 'demo@teacher.com',
      password: passwordHashTeacher,
      name: 'Dr. Jane Smith',
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      teacherProfile: {
        create: {
          employeeId: 'EMP_DEMO_01',
          department: 'Computer Science',
          designation: 'Associate Professor',
        },
      },
    },
  });

  // Admin
  await prisma.user.upsert({
    where: { email: 'demo@admin.com' },
    update: {},
    create: {
      email: 'demo@admin.com',
      password: passwordHashAdmin,
      name: 'Admin User',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // IT Support
  const itSupport = await prisma.user.upsert({
    where: { email: 'it-support@universe.com' },
    update: {},
    create: {
      email: 'it-support@universe.com',
      password: passwordHashAdmin,
      name: 'IT Support',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // More Students
  const alice = await prisma.user.upsert({
    where: { email: 'alice@student.com' },
    update: {},
    create: {
      email: 'alice@student.com',
      password: passwordHashStudent,
      name: 'Alice Johnson',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      avatar: 'A',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@student.com' },
    update: {},
    create: {
      email: 'bob@student.com',
      password: passwordHashStudent,
      name: 'Bob Smith',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      avatar: 'B',
    },
  });

  // Seed conversation if not exists
  const existingConv = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: student.id } } },
        { participants: { some: { userId: itSupport.id } } }
      ]
    }
  });

  if (!existingConv) {
    await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: student.id },
            { userId: itSupport.id }
          ]
        },
        messages: {
          create: [
            {
              senderId: itSupport.id,
              body: 'Hello! How can we help you today?',
              read: false
            }
          ]
        }
      }
    });
  }

  // Conversation with Teacher
  const teacherConv = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: student.id } } },
        { participants: { some: { userId: teacher.id } } }
      ]
    }
  });

  if (!teacherConv) {
    await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: student.id },
            { userId: teacher.id }
          ]
        },
        messages: {
          create: [
            {
              senderId: teacher.id,
              body: 'Don\'t forget about the upcoming assignment for Intro to CS.',
              read: false
            }
          ]
        }
      }
    });
  }

  // Conversation with Alice
  const aliceConv = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: student.id } } },
        { participants: { some: { userId: alice.id } } }
      ]
    }
  });

  if (!aliceConv) {
    await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: student.id },
            { userId: alice.id }
          ]
        },
        messages: {
          create: [
            {
              senderId: alice.id,
              body: 'Hey, do you want to study together for the midterms?',
              read: false
            },
            {
              senderId: student.id,
              body: 'Sure! Meet at the library at 5 PM?',
              read: true
            },
            {
              senderId: alice.id,
              body: 'Sounds good! See you then.',
              read: false
            }
          ]
        }
      }
    });
  }

  // Seed Knowledge Hub Resources
  console.log('Seeding Knowledge Hub...');
  const existingResources = await prisma.knowledgeHubResource.count();
  if (existingResources === 0) {
    await prisma.knowledgeHubResource.createMany({
      data: [
        {
          title: 'Introduction to Machine Learning',
          description: 'A comprehensive guide to ML basics including supervised and unsupervised learning.',
          category: 'Computer Science',
          url: 'https://example.com/ml-basics.pdf',
          authorId: teacher.id,
          isPublic: true,
        },
        {
          title: 'Advanced Data Structures',
          description: 'Detailed notes on Trees, Graphs, and Hash Tables.',
          category: 'Computer Science',
          url: '',
          authorId: teacher.id,
          isPublic: true,
        },
        {
          title: 'Quantum Computing Fundamentals',
          description: 'An overview of qubits, superposition, and quantum entanglement.',
          category: 'Physics',
          url: 'https://example.com/quantum.pdf',
          authorId: teacher.id,
          isPublic: true,
        },
        {
          title: 'Design Patterns in TypeScript',
          description: 'Common software design patterns implemented in TS.',
          category: 'Software Engineering',
          url: 'https://example.com/design-patterns',
          authorId: teacher.id,
          isPublic: true,
        }
      ]
    });
  }

  // Seed Courses
  console.log('Seeding Courses...');
  const cs101 = await prisma.course.upsert({
    where: { code: 'CS101' },
    update: {},
    create: {
      code: 'CS101',
      name: 'Introduction to Computer Science',
      description: 'Basics of programming and algorithmic thinking.',
      credits: 3,
      department: 'Computer Science',
      status: 'PUBLISHED',
      teacherId: teacher.id,
      color: 'bg-blue-500'
    }
  });

  const cs201 = await prisma.course.upsert({
    where: { code: 'CS201' },
    update: {},
    create: {
      code: 'CS201',
      name: 'Data Structures and Algorithms',
      description: 'Advanced data structures and algorithmic complexity.',
      credits: 4,
      department: 'Computer Science',
      status: 'PUBLISHED',
      teacherId: teacher.id,
      color: 'bg-indigo-500'
    }
  });

  // Seed Enrollments
  console.log('Seeding Enrollments...');
  const students = [student, alice, bob];
  for (const s of students) {
    for (const c of [cs101, cs201]) {
      await prisma.enrollment.upsert({
        where: { studentId_courseId: { studentId: s.id, courseId: c.id } },
        update: {},
        create: { studentId: s.id, courseId: c.id }
      });
    }
  }

  // Seed Grades
  console.log('Seeding Grades...');
  for (const s of students) {
    for (const c of [cs101, cs201]) {
      // Assignments
      await prisma.grade.create({
        data: {
          studentId: s.id,
          courseId: c.id,
          assignmentName: 'Assignment 1',
          score: Math.floor(Math.random() * 20) + 80,
          maxScore: 100,
          status: 'GRADED'
        }
      });
      // Midterm
      await prisma.grade.create({
        data: {
          studentId: s.id,
          courseId: c.id,
          assignmentName: 'Midterm Exam',
          score: Math.floor(Math.random() * 25) + 75,
          maxScore: 100,
          status: 'GRADED'
        }
      });
      // Final
      await prisma.grade.create({
        data: {
          studentId: s.id,
          courseId: c.id,
          assignmentName: 'Final Exam',
          score: Math.floor(Math.random() * 30) + 70,
          maxScore: 100,
          status: 'GRADED'
        }
      });
    }
  }

  // Seed Attendance
  console.log('Seeding Attendance...');
  const today = new Date();
  for (const s of students) {
    for (const c of [cs101, cs201]) {
      await prisma.attendance.upsert({
        where: { studentId_courseId_date: { studentId: s.id, courseId: c.id, date: today } },
        update: {},
        create: {
          studentId: s.id,
          courseId: c.id,
          date: today,
          status: Math.random() > 0.2 ? 'PRESENT' : 'LATE'
        }
      });
    }
  }

  // Seed Payments
  console.log('Seeding Payments...');
  const paymentCount = await prisma.payment.count();
  if (paymentCount === 0) {
    const paymentTypes: any[] = ['TUITION', 'EXAM_FEE', 'LIBRARY_FEE', 'OTHER'];
    const paymentStatuses: any[] = ['PENDING', 'COMPLETED', 'FAILED'];
    
    // Create some payments for the admin to see
    for (let i = 0; i < 15; i++) {
      const s = students[i % students.length];
      await prisma.payment.create({
        data: {
          userId: s.id,
          amount: Math.floor(Math.random() * 500) + 50,
          type: paymentTypes[Math.floor(Math.random() * paymentTypes.length)],
          description: `Invoice #${1000 + i}`,
          status: paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)],
        }
      });
    }
  }

  console.log('Demo accounts and messages seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
