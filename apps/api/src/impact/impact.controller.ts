import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ImpactService } from './impact.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('impact')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Get('leaderboard') leaderboard() { return this.impactService.getLeaderboard(); }
  @Get('dashboard/stats') dashboardStats(@CurrentUser() user: any) { return this.impactService.getDashboardStats(user.id); }
  @Get('my-points') myPoints(@CurrentUser() user: any) { return this.impactService.getMyPoints(user.id); }
  @Post('award-points') award(@Body() body: any) { return this.impactService.awardPoints(body.userId, body); }

  @Get('ngos') getNGOs(@Query() q: any) { return this.impactService.getNGOs(q); }
  @Get('ngo-projects') getNGOProjects(@Query() q: any) { return this.impactService.getNGOProjects(q); }
  @Post('ngo-projects/:id/apply') applyNGO(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.impactService.applyToNGOProject(id, user.id, body); }

  @Get('startups') getStartups() { return this.impactService.getStartups(); }
  @Post('startups/:id/apply') applyStartup(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.impactService.applyToStartup(id, user.id, body); }

  @Get('summits') getSummits() { return this.impactService.getSummits(); }
  @Post('summits/:id/register') registerSummit(@Param('id') id: string, @CurrentUser() user: any) { return this.impactService.registerForSummit(id, user.id); }
  @Get('summits/my-registrations') myRegistrations(@CurrentUser() user: any) { return this.impactService.getMyRegistrations(user.id); }
}
