import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { ConsentsController } from './consents.controller';

@Module({ controllers: [ConsentsController], providers: [ConsentsService] })
export class ConsentsModule {}
