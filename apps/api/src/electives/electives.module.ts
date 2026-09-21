import { Module } from '@nestjs/common';
import { ElectivesService } from './electives.service';
import { ElectivesController } from './electives.controller';

@Module({ controllers: [ElectivesController], providers: [ElectivesService] })
export class ElectivesModule {}
