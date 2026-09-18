import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnnouncementTarget } from '@prisma/client';

export class CreateAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsEnum(AnnouncementTarget)
  @IsOptional()
  target?: AnnouncementTarget;

  @IsString()
  @IsOptional()
  courseId?: string;
}

