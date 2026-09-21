import { Controller, Get, Post, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
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

  // Certificates
  @Get('certificates')
  myCertificates(@CurrentUser() user: any) {
    return this.impactService.getCertificates(user.id);
  }

  @Post('certificates/request')
  requestCertificate(@CurrentUser() user: any, @Body() body: { title: string }) {
    return this.impactService.requestCertificate(user.id, body.title);
  }

  // Admin routes for certificates
  @Get('certificates/pending')
  getPendingCertificates() {
    return this.impactService.getPendingCertificateRequests();
  }

  @Post('certificates/:id/approve')
  approveCertificate(@Param('id') id: string) {
    return this.impactService.approveCertificate(id);
  }

  @Get('certificates/:id/pdf')
  async getCertificatePdf(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.impactService.generateCertificatePdf(id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certificate-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (error) {
      res.status(404).send(error.message);
    }
  }
}
