import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo accounts...');

  const passwordHashStudent = await bcrypt.hash('student123', 10);
  const passwordHashTeacher = await bcrypt.hash('teacher123', 10);
  const passwordHashAdmin = await bcrypt.hash('admin123', 10);

  // Student
  await prisma.user.upsert({
    where: { email: 'student@universe.edu' },
    update: {},
    create: {
      email: 'student@universe.edu',
      password: passwordHashStudent,
      name: 'John Doe',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        create: {
          studentId: 'STU1001',
          department: 'Computer Science',
          year: 2,
          gpa: 3.74,
        },
      },
    },
  });

  // Teacher
  await prisma.user.upsert({
    where: { email: 'teacher@universe.edu' },
    update: {},
    create: {
      email: 'teacher@universe.edu',
      password: passwordHashTeacher,
      name: 'Dr. Jane Smith',
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      teacherProfile: {
        create: {
          employeeId: 'EMP1001',
          department: 'Computer Science',
          designation: 'Associate Professor',
        },
      },
    },
  });

  // Admin
  await prisma.user.upsert({
    where: { email: 'admin@universe.edu' },
    update: {},
    create: {
      email: 'admin@universe.edu',
      password: passwordHashAdmin,
      name: 'Admin User',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log('Demo accounts seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
