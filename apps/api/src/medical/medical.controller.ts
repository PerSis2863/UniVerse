import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MedicalService } from './medical.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('medical')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('medical')
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  @Get('my') getMyRecord(@CurrentUser() user: any) { return this.medicalService.getMyRecord(user.id); }
  @Post('my') upsert(@CurrentUser() user: any, @Body() body: any) { return this.medicalService.upsert(user.id, body); }
}
