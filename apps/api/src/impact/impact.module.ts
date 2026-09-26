import { Module } from '@nestjs/common';
import { ImpactService } from './impact.service';
import { ImpactController } from './impact.controller';
import { CredentialVerifyController } from './credential-verify.controller';

@Module({ controllers: [ImpactController, CredentialVerifyController], providers: [ImpactService] })
export class ImpactModule {}
