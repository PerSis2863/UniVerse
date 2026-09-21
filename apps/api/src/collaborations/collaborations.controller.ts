import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollaborationsService } from './collaborations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('collaborations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collaborations')
export class CollaborationsController {
  constructor(private readonly collaborationsService: CollaborationsService) {}

  @Get('my') getMy(@CurrentUser() user: any) { return this.collaborationsService.getMyCollabs(user.id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.collaborationsService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.collaborationsService.update(id, body); }

  // ─── PHASE 3: COLLABORATION PROJECTS (NGO/Student Projects) ──────────────────

  @Get('projects')
  getProjects() {
    return this.collaborationsService.getProjects();
  }

  @Get('projects/:id')
  getProjectById(@Param('id') id: string) {
    return this.collaborationsService.getProjectById(id);
  }

  @Post('projects')
  createProject(@CurrentUser() user: any, @Body() body: any) {
    return this.collaborationsService.createProject(user.id, body);
  }

  @Patch('projects/:id')
  updateProject(@Param('id') id: string, @Body() body: any) {
    return this.collaborationsService.updateProject(id, body);
  }

  @Post('projects/:id/join')
  joinProject(@CurrentUser() user: any, @Param('id') projectId: string, @Body('role') role: string) {
    return this.collaborationsService.joinProject(projectId, user.id, role);
  }

  @Post('projects/:id/milestones')
  createMilestone(@Param('id') projectId: string, @Body() body: any) {
    return this.collaborationsService.createMilestone(projectId, body);
  }

  @Patch('projects/milestones/:milestoneId')
  updateMilestone(@Param('milestoneId') milestoneId: string, @Body() body: any) {
    return this.collaborationsService.updateMilestone(milestoneId, body);
  }
}
