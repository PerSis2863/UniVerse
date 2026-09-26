import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ImpactService } from './impact.service';

/**
 * Public (no login) credential verification, used by the /verify/[id] page,
 * employers, and anyone who receives a credential link.
 */
@ApiTags('verify')
@Controller('verify')
export class CredentialVerifyController {
  constructor(private readonly impactService: ImpactService) {}

  @Get('public-key')
  publicKey() {
    return this.impactService.getCredentialPublicKey();
  }

  @Get(':idOrCode')
  verify(@Param('idOrCode') idOrCode: string) {
    return this.impactService.verifyCredentialPublic(idOrCode);
  }
}
