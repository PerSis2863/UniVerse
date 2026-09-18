import { Module } from '@nestjs/common';
import { CareerController } from './career.controller';

@Module({
  controllers: [CareerController],
})
export class CareerModule {}
