import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  create(createAnnouncementDto: CreateAnnouncementDto, authorId: string) {
    return this.prisma.announcement.create({
      data: {
        ...createAnnouncementDto,
        authorId,
      },
    });
  }

  findAll() {
    return this.prisma.announcement.findMany({
      include: { author: { select: { name: true, email: true, avatar: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: { author: { select: { name: true, email: true, avatar: true } } },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  update(id: string, updateAnnouncementDto: UpdateAnnouncementDto) {
    return this.prisma.announcement.update({
      where: { id },
      data: updateAnnouncementDto,
    });
  }

  remove(id: string) {
    return this.prisma.announcement.delete({
      where: { id },
    });
  }
}
