import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScholarshipsService } from './scholarships.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('scholarships')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('scholarships')
export class ScholarshipsController {
  constructor(private readonly scholarshipsService: ScholarshipsService) {}

  @Get() findAll() { return this.scholarshipsService.findAll(); }
  @Get('my-applications') myApps(@CurrentUser() user: any) { return this.scholarshipsService.getMyApplications(user.id); }
  
  @Post() 
  @Roles(Role.ADMIN)
  create(@Body() body: any) { return this.scholarshipsService.create(body); }
  
  @Post(':id/apply') apply(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.scholarshipsService.apply(id, user.id, body); }
  
  @Patch('applications/:id') 
  @Roles(Role.ADMIN)
  updateApp(@Param('id') id: string, @Body() body: any) { return this.scholarshipsService.updateApplication(id, body); }
}
