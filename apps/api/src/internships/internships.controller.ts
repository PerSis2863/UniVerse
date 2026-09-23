import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InternshipsService } from './internships.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('internships')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('internships')
export class InternshipsController {
  constructor(private readonly internshipsService: InternshipsService) {}

  @Get() findAll(@Query() q: any) { return this.internshipsService.findAll(q); }
  @Get('my-applications') myApps(@CurrentUser() user: any) { return this.internshipsService.getMyApplications(user.id); }
  @Get(':id') findOne(@Param('id') id: string) { return this.internshipsService.findOne(id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.internshipsService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.internshipsService.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.internshipsService.remove(id); }
  @Post(':id/apply') apply(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.internshipsService.apply(id, user.id, body); }
  @Patch('applications/:id') updateApp(@Param('id') id: string, @Body() body: any) { return this.internshipsService.updateApplication(id, body); }
}
