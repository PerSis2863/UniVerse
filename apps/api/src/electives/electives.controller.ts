import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ElectivesService } from './electives.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('electives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('electives')
export class ElectivesController {
  constructor(private readonly electivesService: ElectivesService) {}

  @Get('available') getAvailable(@CurrentUser() user: any) { return this.electivesService.getAvailableElectives(user.id); }
  @Get('my') getMy(@CurrentUser() user: any) { return this.electivesService.getMyElectives(user.id); }
  @Post('select') select(@CurrentUser() user: any, @Body() body: any) { return this.electivesService.selectElective(user.id, body); }
  @Patch(':id/withdraw') withdraw(@Param('id') id: string) { return this.electivesService.withdrawElective(id); }
  @Get('major-requests') getMajorRequests(@CurrentUser() user: any) { return this.electivesService.getMyMajorRequests(user.id); }
  @Post('major-requests') submitMajorRequest(@CurrentUser() user: any, @Body() body: any) { return this.electivesService.submitMajorRequest(user.id, body); }
  @Patch('major-requests/:id/review') reviewMajorRequest(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.electivesService.reviewMajorRequest(id, user.id, body); }
}
