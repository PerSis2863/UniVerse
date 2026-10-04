import { NotFoundException } from '../http';
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from '../dto';
import prisma from '@/lib/db';

export class AnnouncementsService {
  create(createAnnouncementDto: CreateAnnouncementDto, authorId: string) {
    return prisma.announcement.create({
      data: {
        ...createAnnouncementDto,
        authorId,
      },
    });
  }

  // Every signed-in user can read these: authors' email addresses stay out (the UI never shows them).
  findAll() {
    return prisma.announcement.findMany({
      include: { author: { select: { name: true, avatar: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const announcement = await prisma.announcement.findUnique({
      where: { id },
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
