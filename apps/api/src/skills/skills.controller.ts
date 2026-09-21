import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('my') findMy(@CurrentUser() user: any) { return this.skillsService.findByUser(user.id); }
  @Get('user/:userId') findByUser(@Param('userId') id: string) { return this.skillsService.findByUser(id); }
  @Post() upsert(@CurrentUser() user: any, @Body() body: any) { return this.skillsService.upsert(user.id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.skillsService.remove(id); }
}
