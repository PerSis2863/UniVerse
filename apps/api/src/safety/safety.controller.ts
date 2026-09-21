import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get() 
  @Roles(Role.ADMIN)
  findAll() { return this.safetyService.findAll(); }
  
  @Post('report') report(@CurrentUser() user: any, @Body() body: any) { return this.safetyService.create(user.id, body); }
  
  @Patch(':id/resolve') 
  @Roles(Role.ADMIN)
  resolve(@Param('id') id: string) { return this.safetyService.resolve(id); }
}
