import { Module } from '@nestjs/common';
import { KnowledgeHubService } from './knowledge-hub.service';
import { KnowledgeHubController } from './knowledge-hub.controller';

@Module({
  controllers: [KnowledgeHubController],
  providers: [KnowledgeHubService],
})
export class KnowledgeHubModule {}
