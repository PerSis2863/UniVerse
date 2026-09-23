import { Controller, Get, Post, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
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
    return this.associationsService.getUserMemberships(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.associationsService.findOne(id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Req() req) {
    return this.associationsService.join(id, req.user.id);
  }

  @Delete(':id/leave')
  leave(@Param('id') id: string, @Req() req) {
    return this.associationsService.leave(id, req.user.id);
  }

  @Post()
  create(@Req() req) {
    return this.associationsService.create(req.body, req.user.id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Req() req) {
    return this.associationsService.updateStatus(id, req.body.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req) {
    return this.associationsService.update(id, req.body);
  }
}
