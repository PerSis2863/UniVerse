import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InternshipsService } from './internships.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('internships')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller('internships')
export class InternshipsController {
  constructor(private readonly internshipsService: InternshipsService) {}

  @Get() findAll(@Query() q: any) { return this.internshipsService.findAll(q); }
  @Get('my-applications') myApps(@CurrentUser() user: any) { return this.internshipsService.getMyApplications(user.id); }
  @Get(':id') findOne(@Param('id') id: string, @CurrentUser() user: any) { return this.internshipsService.findOne(id, user); }
  @Post() @Roles(Role.ADMIN, Role.TEACHER, Role.INDUSTRY_MENTOR) create(@CurrentUser() user: any, @Body() body: any) { return this.internshipsService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) { return this.internshipsService.update(id, body, user); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: any) { return this.internshipsService.remove(id, user); }
  @Post(':id/apply') apply(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.internshipsService.apply(id, user.id, body); }
  @Patch('applications/:id') updateApp(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) { return this.internshipsService.updateApplication(id, body, user); }
}
