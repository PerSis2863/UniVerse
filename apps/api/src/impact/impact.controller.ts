import { Controller, Get, Post, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ImpactService } from './impact.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('impact')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller('impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  // ── Core ────────────────────────────────────────────────────────────────
  @Get('leaderboard') leaderboard() { return this.impactService.getLeaderboard(); }
  @Get('dashboard/stats') dashboardStats(@CurrentUser() user: any) { return this.impactService.getDashboardStats(user.id); }
  @Get('my-points') myPoints(@CurrentUser() user: any) { return this.impactService.getMyPoints(user.id); }
  @Get('my-level') myLevel(@CurrentUser() user: any) { return this.impactService.getMyLevel(user.id); }

  @Post('award-points')
  @Roles(Role.ADMIN, Role.TEACHER)
  award(@Body() body: any) { return this.impactService.awardPoints(body.userId, body); }

  // ── NGOs & Projects ──────────────────────────────────────────────────────
  @Get('ngos') getNGOs(@Query() q: any) { return this.impactService.getNGOs(q); }
  @Get('ngo-projects') getNGOProjects(@Query() q: any) { return this.impactService.getNGOProjects(q); }
  @Post('ngo-projects/:id/apply') applyNGO(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.impactService.applyToNGOProject(id, user.id, body); }

  // ── Startups ─────────────────────────────────────────────────────────────
  @Get('startups') getStartups() { return this.impactService.getStartups(); }
  @Post('startups/:id/apply') applyStartup(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.impactService.applyToStartup(id, user.id, body); }

  // ── Summits ──────────────────────────────────────────────────────────────
  @Get('summits') getSummits() { return this.impactService.getSummits(); }
  @Post('summits/:id/register') registerSummit(@Param('id') id: string, @CurrentUser() user: any) { return this.impactService.registerForSummit(id, user.id); }
  @Get('summits/my-registrations') myRegistrations(@CurrentUser() user: any) { return this.impactService.getMyRegistrations(user.id); }

  // ── Blockchain Credentials ───────────────────────────────────────────────
  @Get('blockchain-credentials')
  myBlockchainCredentials(@CurrentUser() user: any) {
    return this.impactService.getMyBlockchainCredentials(user.id);
  }

  @Post('blockchain-credentials/issue')
  issueCredential(@CurrentUser() user: any, @Body() body: any) {
    return this.impactService.issueBlockchainCredential(user.id, body);
  }

  // ── AI Project Matching ──────────────────────────────────────────────────
  @Get('ai-match')
  aiProjectMatch(@CurrentUser() user: any) {
    return this.impactService.getAIProjectMatches(user.id);
  }

  // ── Legacy Certificates ──────────────────────────────────────────────────
  @Get('certificates') myCertificates(@CurrentUser() user: any) { return this.impactService.getCertificates(user.id); }
  @Post('certificates/request') requestCertificate(@CurrentUser() user: any, @Body() body: { title: string }) { return this.impactService.requestCertificate(user.id, body.title); }

  @Get('certificates/pending')
  @Roles(Role.ADMIN)
  getPendingCertificates() { return this.impactService.getPendingCertificateRequests(); }

  @Post('certificates/:id/approve')
  @Roles(Role.ADMIN)
  approveCertificate(@Param('id') id: string) { return this.impactService.approveCertificate(id); }

  @Get('certificates/:id/pdf')
  async getCertificatePdf(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.impactService.generateCertificatePdf(id);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="certificate-${id}.pdf"`, 'Content-Length': pdfBuffer.length });
      res.end(pdfBuffer);
    } catch (error) {
      res.status(404).send(error.message);
    }
  }
}
