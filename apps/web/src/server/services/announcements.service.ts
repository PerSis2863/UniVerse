import { NotFoundException } from '../http';
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from '../dto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { announcementWhere } from '../course-announcements';

export class AnnouncementsService {
  create(createAnnouncementDto: CreateAnnouncementDto, authorId: string) {
    return prisma.announcement.create({
      data: {
        ...createAnnouncementDto,
        authorId,
      },
    });
  }

  // School-wide ones and those of the person's own courses (src/server/course-announcements.ts):
  // authors' email addresses stay out (the UI never shows them).
  async findAll(user: SessionUser) {
    return prisma.announcement.findMany({
      where: await announcementWhere(user),
      // Staff also see how many people have read each one (M17: "Seen by" on Messages → Announcements).
      include: { author: { select: { name: true, avatar: true } }, course: { select: { name: true } }, ...(user.role === 'ADMIN' || user.role === 'TEACHER' ? { _count: { select: { reads: true } } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, user: SessionUser) {
    const announcement = await prisma.announcement.findFirst({
      where: { id, ...(await announcementWhere(user)) },
      include: { author: { select: { name: true, avatar: true } } },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  update(id: string, updateAnnouncementDto: UpdateAnnouncementDto) {
    return prisma.announcement.update({
      where: { id },
      data: updateAnnouncementDto,
    });
  }

  remove(id: string) {
    return prisma.announcement.delete({
      where: { id },
    });
  }
}
