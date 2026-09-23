import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get() @Roles(Role.ADMIN) findAll() { return this.documentsService.findAll(); }
  @Get('my') findMy(@CurrentUser() user: any) { return this.documentsService.findByUser(user.id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.documentsService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) { return this.documentsService.update(id, user.id, body); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: any) { return this.documentsService.remove(id, user.id); }
}
