import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get() findAll(@Query() q: any) { return this.groupsService.findAll(q); }
  @Get('my') findMy(@CurrentUser() user: any) { return this.groupsService.findMyGroups(user.id); }
  @Get(':id') findOne(@Param('id') id: string) { return this.groupsService.findOne(id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.groupsService.create(user.id, body); }
  @Post(':id/join') join(@Param('id') id: string, @CurrentUser() user: any) { return this.groupsService.join(id, user.id); }
  @Delete(':id/leave') leave(@Param('id') id: string, @CurrentUser() user: any) { return this.groupsService.leave(id, user.id); }
  @Get(':id/posts') getPosts(@Param('id') id: string) { return this.groupsService.getPosts(id); }
  @Post(':id/posts') createPost(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.groupsService.createPost(id, user.id, body); }
  @Post(':id/invite') invite(@Param('id') id: string, @Body() body: { emails: string[] }) { return this.groupsService.inviteMembers(id, body.emails); }
}
