import { Module } from '@nestjs/common';
import { SafetyService } from './safety.service';
import { SafetyController } from './safety.controller';

@Module({ controllers: [SafetyController], providers: [SafetyService] })
export class SafetyModule {}
