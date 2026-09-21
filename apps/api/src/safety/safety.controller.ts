import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get() findAll() { return this.safetyService.findAll(); }
  @Post('report') report(@CurrentUser() user: any, @Body() body: any) { return this.safetyService.create(user.id, body); }
  @Patch(':id/resolve') resolve(@Param('id') id: string) { return this.safetyService.resolve(id); }
}
