import { Module } from '@nestjs/common';
import { ScholarshipsService } from './scholarships.service';
import { ScholarshipsController } from './scholarships.controller';

@Module({ controllers: [ScholarshipsController], providers: [ScholarshipsService] })
export class ScholarshipsModule {}
