import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScholarshipsService } from './scholarships.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('scholarships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scholarships')
export class ScholarshipsController {
  constructor(private readonly scholarshipsService: ScholarshipsService) {}

  @Get() findAll() { return this.scholarshipsService.findAll(); }
  @Get('my-applications') myApps(@CurrentUser() user: any) { return this.scholarshipsService.getMyApplications(user.id); }
  @Post() create(@Body() body: any) { return this.scholarshipsService.create(body); }
  @Post(':id/apply') apply(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.scholarshipsService.apply(id, user.id, body); }
  @Patch('applications/:id') updateApp(@Param('id') id: string, @Body() body: any) { return this.scholarshipsService.updateApplication(id, body); }
}
