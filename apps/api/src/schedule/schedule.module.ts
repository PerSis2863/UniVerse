import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScheduleController],
})
export class ScheduleModule {}
