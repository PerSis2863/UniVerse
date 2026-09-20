import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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
