import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, UserStatus } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: { role?: Role; status?: UserStatus; search?: string }) {
    return this.usersService.findAll(query);
  }

  @Get('directory')
  findDirectory(@Query('search') search?: string) {
    return this.usersService.findDirectory(search);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  stats() {
    return this.usersService.getStats();
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.usersService.findOne(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post('invitations')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  inviteUser(@Body() body: { email: string; role: Role }) {
    return this.usersService.inviteUser(body.email, body.role);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.usersService.updateStatus(id, status);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  delete(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
