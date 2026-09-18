import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { QuizStatus } from '@prisma/client';

export class CreateQuizDto {
  @IsString()
  courseId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsInt()
  @IsOptional()
  timeLimit?: number;

  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;
}

