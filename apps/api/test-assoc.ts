import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'demo@student.com' } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { dateOfBirth: new Date('2000-01-01') }
    });
    
    // Also check student profile
    const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id } });
    if (profile) {
      await prisma.studentProfile.update({
        where: { id: profile.id },
        data: { gpa: 3.8, year: 3 }
      });
    } else {
      await prisma.studentProfile.create({
        data: { userId: user.id, studentId: 'STU123', gpa: 3.8, year: 3 }
      });
    }
    console.log("Updated user");
  } else {
    console.log("User not found");
  }
}

main()
