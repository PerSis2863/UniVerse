import { PrismaClient, Role, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo accounts...');


  // Student
  const student = await prisma.user.upsert({
    where: { email: 'demo@student.com' },
    update: {},
    create: {
      email: 'demo@student.com',
      name: 'John Doe',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      dateOfBirth: new Date(new Date().getFullYear() - 20, 0, 1),
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
              body: 'Hey! Are we still meeting for the study group later?',
              read: true
            },
            {
              senderId: student.id,
              body: 'Yes, absolutely. 5 PM at the library?',
              read: true
            },
            {
              senderId: alice.id,
              body: 'Perfect, see you there!',
              read: false
            }
          ]
        }
      }
    });
  }

  // Conversation with Bob
  const bobConv = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: student.id } } },
        { participants: { some: { userId: bob.id } } }
      ]
    }
  });

  if (!bobConv) {
    await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: student.id },
            { userId: bob.id }
          ]
        },
        messages: {
          create: [
            {
              senderId: student.id,
              body: 'Did you finish the lab report?',
              read: true
            },
            {
              senderId: bob.id,
              body: 'Almost done. Just need to add the conclusion. You?',
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

  // Seed Companies and Internships
  console.log('Seeding Internships...');
  const companyCount = await prisma.company.count();
  if (companyCount === 0) {
    const google = await prisma.company.create({
      data: {
        name: 'Google',
        location: 'Mountain View, CA',
        sector: 'Technology'
      }
    });

    const microsoft = await prisma.company.create({
      data: {
        name: 'Microsoft',
        location: 'Seattle, WA',
        sector: 'Technology'
      }
    });

    await prisma.internship.createMany({
      data: [
        {
          companyId: google.id,
          title: 'Software Engineering Intern',
          description: 'Work on cutting edge technologies.',
          type: 'FULL_TIME',
          location: 'Mountain View, CA',
          duration: '12 weeks',
          salary: '$8,000/mo',
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: true
        },
        {
          companyId: microsoft.id,
          title: 'Data Science Co-op',
          description: 'Analyze large datasets to improve product experience.',
          type: 'PART_TIME',
          location: 'Seattle, WA',
          duration: '6 months',
          salary: '$7,500/mo',
          deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          isActive: true
        }
      ]
    });
  }

  // Seed Administrative Data
  console.log('Seeding Administrative Data...');
  
  // Scholarships
  const scholarshipCount = await prisma.scholarship.count();
  if (scholarshipCount === 0) {
    const meritscholarship = await prisma.scholarship.create({
      data: {
        name: 'Excellence in STEM Scholarship',
        description: 'Awarded to top-performing students in Science, Technology, Engineering, and Mathematics.',
        amount: 5000,
        currency: 'USD',
        provider: 'Tech Innovators Foundation',
        deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        requirements: 'Minimum GPA of 3.8. Must be enrolled in a STEM program.',
        isActive: true,
      }
    });

    await prisma.scholarship.create({
      data: {
        name: 'Community Leadership Award',
        description: 'For students demonstrating exceptional commitment to community service.',
        amount: 2500,
        currency: 'USD',
        provider: 'Local Community Board',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        isActive: true,
      }
    });

    await prisma.scholarshipApplication.create({
        data: {
            scholarshipId: meritscholarship.id,
            studentId: student.id,
            status: 'PENDING',
            essay: 'I believe I am a strong candidate for this scholarship because...',
        }
    });
  }

  // Documents
  const docCount = await prisma.studentDocument.count();
  if (docCount === 0) {
    await prisma.studentDocument.createMany({
        data: [
            {
                userId: student.id,
                type: 'TRANSCRIPT',
                title: 'Official Transcript - Fall 2025',
                fileUrl: 'https://example.com/transcript.pdf',
                issuedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
                isVerified: true
            },
            {
                userId: student.id,
                type: 'LETTER',
                title: 'Enrollment Verification Letter',
                fileUrl: 'https://example.com/enrollment.pdf',
                isVerified: false
            }
        ]
    });
  }

  // Invoices
  const invoiceCount = await prisma.invoice.count();
  if (invoiceCount === 0) {
      await prisma.invoice.createMany({
          data: [
              {
                  userId: student.id,
                  number: 'INV-2026-001',
                  amount: 4500,
                  status: 'PENDING',
                  dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
                  description: 'Fall Semester Tuition',
                  items: [{ label: 'Tuition', amount: 4500 }]
              },
              {
                  userId: student.id,
                  number: 'INV-2026-002',
                  amount: 250,
                  status: 'COMPLETED',
                  paidAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                  description: 'Library Fees',
                  items: [{ label: 'Late Return Fee', amount: 50 }, { label: 'Book Replacement', amount: 200 }]
              }
          ]
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
