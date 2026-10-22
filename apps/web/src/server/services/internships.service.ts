import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import { first, oneOf, str, strings, type Body, type Query } from '../body';
import prisma from '@/lib/db';
import { alertNewOpening } from '../careers';
import { assertInSchool, peopleWhere, schoolsOf, usersIn } from '../school-scope';

type Who = { id: string; role: string; organizationId?: string | null; email?: string };

/** The skills an opening asks for: a list or "a, b, c", up to 6 (they drive skills match and job alerts). */
function skillsOf(v: unknown): string[] {
  const list = typeof v === 'string' ? v.split(',') : strings(v);
  const seen = new Set<string>();
  return list.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 40)).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 6);
}

export class InternshipsService {
  async findAll(query: Query) {
    const search = first(query.search);
    const type = first(query.type);
    return prisma.internship.findMany({
      where: {
        isActive: true,
        ...(search && { OR: [{ title: { contains: search } }, { description: { contains: search } }] }),
        ...(type && { type: type as Prisma.InternshipWhereInput['type'] }),
      },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin view: every internship (active or not) with who posted it and the admin's own school's applicants. */
  async findAllForAdmin(admin: Who) {
    const mine = { student: await peopleWhere(admin) };
    return prisma.internship.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        company: { select: { id: true, name: true } },
        postedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { applications: { where: mine } } },
        applications: {
          where: mine,
          orderBy: { appliedAt: 'desc' },
          take: 200,
          select: {
            id: true, status: true, appliedAt: true, cvUrl: true,
            student: {
              select: {
                id: true, name: true, email: true, role: true, status: true, phone: true,
                studentProfile: { select: { department: true, year: true, gpa: true } },
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string, user: Who) {
    const item = await prisma.internship.findUnique({ where: { id }, include: { company: true } });
    if (!item) throw new NotFoundException();
    // Applicant details are only visible to whoever posted the internship (all of them) and admins
    // (their own school's applicants).
    if (user.role === 'ADMIN' || item.postedById === user.id) {
      const applications = await prisma.internshipApplication.findMany({
        where: { internshipId: id, ...(item.postedById === user.id ? {} : { student: await peopleWhere(user) }) },
        include: { student: { select: { id: true, name: true, email: true, avatar: true } } },
      });
      return { ...item, applications };
    }
    return item;
  }

  /**
   * The poster, or an admin of the poster's school (and of the applicant's, when deciding an
   * application). Another school's admin gets "not found".
   */
  private async assertCanManage(internshipId: string, user: Who, studentId?: string) {
    const item = await prisma.internship.findUnique({ where: { id: internshipId }, select: { postedById: true } });
    if (!item) throw new NotFoundException();
    if (item.postedById === user.id) return;
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only the poster or an admin can do this.');
    const schools = await schoolsOf(user);
    if (schools === 'all') return;
    const poster = item.postedById ? await prisma.user.findFirst({ where: { id: item.postedById, ...usersIn(schools) }, select: { id: true } }) : null;
    if (!poster) throw new NotFoundException();
    if (studentId) await assertInSchool(user, studentId);
  }

  async apply(internshipId: string, studentId: string, body: Body) {
    // Applicants can only submit their cover letter and CV; status is set by reviewers.
    const data = pick<Prisma.InternshipApplicationUncheckedCreateInput>(body, ['coverLetter', 'cvUrl']);
    return prisma.internshipApplication.upsert({
      where: { internshipId_studentId: { internshipId, studentId } },
      create: { ...data, internshipId, studentId },
      update: data,
    });
  }

  async getMyApplications(studentId: string) {
    return prisma.internshipApplication.findMany({ where: { studentId }, include: { internship: { include: { company: true } } } });
  }

  async updateApplication(id: string, data: Body, user: Who) {
    const app = await prisma.internshipApplication.findUnique({ where: { id }, select: { internshipId: true, studentId: true } });
    if (!app) throw new NotFoundException();

    // Applicants can edit their cover letter / CV and withdraw; nothing else.
    if (app.studentId === user.id && user.role !== 'ADMIN') {
      if (data.status !== undefined && data.status !== 'WITHDRAWN') throw new ForbiddenException('You can only withdraw your application.');
      return prisma.internshipApplication.update({
        where: { id },
        data: { ...pick<Prisma.InternshipApplicationUncheckedUpdateInput>(data, ['coverLetter', 'cvUrl']), ...(data.status === 'WITHDRAWN' ? { status: 'WITHDRAWN' as const } : {}) },
      });
    }

    // Reviewers (poster or admin) set the status.
    await this.assertCanManage(app.internshipId, user, app.studentId);
    const allowed = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const;
    const status = data.status;
    if (!oneOf(allowed, status)) throw new BadRequestException('Invalid status');
    return prisma.internshipApplication.update({ where: { id }, data: { status } });
  }

  private async getOrCreateCompany(companyName: string | undefined) {
    if (!companyName) return null;
    let company = await prisma.company.findFirst({
      where: { name: { equals: companyName } }
    });
    if (!company) {
      company = await prisma.company.create({
        data: { name: companyName }
      });
    }
    return company.id;
  }

  private static FIELDS = ['title', 'description', 'type', 'location', 'duration', 'isPaid', 'salary', 'openings', 'deadline', 'startDate', 'isActive'] as const satisfies readonly (keyof Prisma.InternshipUncheckedCreateInput)[];

  async create(userId: string, data: Body) {
    type New = Prisma.InternshipUncheckedCreateInput;
    const companyId = await this.getOrCreateCompany(str(data.company));
    const created = await prisma.internship.create({
      data: {
        ...pick<New>(data, InternshipsService.FIELDS),
        skills: skillsOf(data.skills),
        companyId: companyId as string,
        postedById: userId,
      } as New,
    });
    // Students whose checked skills match hear about it (Stage 5 · Q15).
    alertNewOpening(created.id);
    return created;
  }

  async update(id: string, data: Body, user: Who) {
    await this.assertCanManage(id, user);
    const company = str(data.company);
    const updateData = pick<Prisma.InternshipUncheckedUpdateInput>(data, InternshipsService.FIELDS);
    if (company) {
      updateData.companyId = await this.getOrCreateCompany(company);
    }
    if ('skills' in data) updateData.skills = skillsOf(data.skills);
    const updated = await prisma.internship.update({
      where: { id },
      data: updateData,
    });
    // Opened (or given skills) for the first time: tell matching students once.
    if (updated.isActive && !updated.alertedAt) alertNewOpening(updated.id);
    return updated;
  }

  async remove(id: string, user: Who) {
    await this.assertCanManage(id, user);
    return prisma.internship.delete({
      where: { id }
    });
  }
}
