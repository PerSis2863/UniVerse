import { Module } from '@nestjs/common';
import { BlackboardController } from './blackboard.controller';
import { BlackboardService } from './blackboard.service';

@Module({
  controllers: [BlackboardController],
  providers: [BlackboardService],
})
export class BlackboardModule {}
