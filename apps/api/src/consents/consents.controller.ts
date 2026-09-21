import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConsentsService } from './consents.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('consents')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('consents')
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Get('my') getMy(@CurrentUser() user: any) { return this.consentsService.getMyConsents(user.id); }
  @Post('upsert') upsert(@CurrentUser() user: any, @Body() body: { type: string; granted: boolean }) { return this.consentsService.upsertConsent(user.id, body.type, body.granted); }
}
