import { Module } from '@nestjs/common';
import { CollaborationsService } from './collaborations.service';
import { CollaborationsController } from './collaborations.controller';

@Module({ controllers: [CollaborationsController], providers: [CollaborationsService] })
export class CollaborationsModule {}
