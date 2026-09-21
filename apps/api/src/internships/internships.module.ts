import { Module } from '@nestjs/common';
import { InternshipsService } from './internships.service';
import { InternshipsController } from './internships.controller';

@Module({ controllers: [InternshipsController], providers: [InternshipsService] })
export class InternshipsModule {}
