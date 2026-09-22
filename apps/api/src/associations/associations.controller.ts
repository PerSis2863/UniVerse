import { Controller, Get, Post, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { AssociationsService } from './associations.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('associations')
@UseGuards(FirebaseAuthGuard)
export class AssociationsController {
  constructor(private readonly associationsService: AssociationsService) {}

  @Get()
  findAll() {
    return this.associationsService.findAll();
  }

  @Get('my-memberships')
  getMyMemberships(@Req() req) {
    return this.associationsService.getUserMemberships(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.associationsService.findOne(id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Req() req) {
    return this.associationsService.join(id, req.user.userId);
  }

  @Delete(':id/leave')
  leave(@Param('id') id: string, @Req() req) {
    return this.associationsService.leave(id, req.user.userId);
  }
}
