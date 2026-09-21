import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CareerController } from './career.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CareerController],
})
export class CareerModule {}
