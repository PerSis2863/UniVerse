import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateKnowledgeHubDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsUrl()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  courseId?: string;
}

