import { PartialType } from '@nestjs/swagger';
import { CreateKnowledgeHubDto } from './create-knowledge-hub.dto';

export class UpdateKnowledgeHubDto extends PartialType(CreateKnowledgeHubDto) {}
