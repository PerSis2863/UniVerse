import { Module } from '@nestjs/common';
import { ImpactService } from './impact.service';
import { ImpactController } from './impact.controller';
import { CredentialVerifyController } from './credential-verify.controller';
import { ChainAnchorService } from './chain-anchor.service';

@Module({
  controllers: [ImpactController, CredentialVerifyController],
  providers: [ImpactService, ChainAnchorService],
})
export class ImpactModule {}
